package game

import (
	"context"
	"dango/internal/events"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"strconv"
)

type GameService struct {
	gameRepo     GameRepository
	bus          events.EventBus
	botService   *BotService
	timerService *GameTimerService
}

func NewGameService(gameRepo GameRepository, bus events.EventBus, botService *BotService, timerService *GameTimerService) *GameService {
	return &GameService{
		gameRepo:     gameRepo,
		bus:          bus,
		botService:   botService,
		timerService: timerService,
	}
}

func (s *GameService) GetGame(ctx context.Context, gameID int) (*Game, error) {
	// Check if it's a bot game first
	if s.botService.IsBotGame(gameID) {
		return s.botService.GetBotGameState(gameID)
	}

	// Otherwise load from database (event replay or legacy fallback)
	return s.gameRepo.FindByID(ctx, gameID)
}

func (s *GameService) GetUserGameHistory(ctx context.Context, userID int) ([]GameHistoryEntry, error) {
	return s.gameRepo.FindUserGameHistory(ctx, userID)
}

// GetGameEvents returns all domain events for a game (for replay).
func (s *GameService) GetGameEvents(ctx context.Context, gameID int) ([]events.DomainEvent, error) {
	return s.gameRepo.LoadEvents(ctx, gameID)
}

func (s *GameService) CreateGame(ctx context.Context, playerIDs []int, boardSize int) (*Game, error) {
	if boardSize < 5 || boardSize > 10 {
		return nil, errors.New("invalid board size: must be between 5 and 10, got: " + strconv.Itoa(boardSize))
	}

	if len(playerIDs) < 2 || len(playerIDs) > 4 {
		return nil, errors.New("game requires 2-4 players")
	}

	seen := make(map[int]bool)
	for _, id := range playerIDs {
		if seen[id] {
			return nil, fmt.Errorf("duplicate player ID: %d", id)
		}
		seen[id] = true
	}

	usernames, err := s.gameRepo.FindUsernamesByIDs(ctx, playerIDs)
	if err != nil {
		slog.Warn("Failed to look up usernames, using fallback", "error", err)
		usernames = make(map[int]string)
	}

	players := make([]Player, len(playerIDs))
	for i, id := range playerIDs {
		username := usernames[id]
		if username == "" {
			username = fmt.Sprintf("Player%d", id)
		}
		players[i] = Player{
			UserID:   &id,
			Username: username,
		}
	}

	// Shuffle players for random turn order before raising the event
	rand.Shuffle(len(players), func(i, j int) {
		players[i], players[j] = players[j], players[i]
	})
	for i := range players {
		players[i].TurnOrder = i
		players[i].Score = 0
	}

	// Create aggregate via domain event (GameCreated)
	tempID := 0
	game := NewGame(&tempID, boardSize, players)

	// Persist: projection + events
	if err := s.gameRepo.Create(ctx, game); err != nil {
		return nil, err
	}

	slog.Info("Game created", "gameID", *game.GameID, "boardSize", boardSize, "players", len(players))

	s.publishIntegrationEvent(ctx, "global:games", "game_created", game)

	if s.timerService != nil {
		s.timerService.StartTimer(*game.GameID, game.Players, game.CurrentTurn)
	}

	return game, nil
}

func (s *GameService) CreateBotGame(ctx context.Context, playerIDs []int, numBots int, boardSize int) (*Game, error) {
	usernames, err := s.gameRepo.FindUsernamesByIDs(ctx, playerIDs)
	if err != nil {
		slog.Warn("Failed to look up usernames for bot game, using fallback", "error", err)
		usernames = make(map[int]string)
	}

	game, err := s.botService.CreateBotGame(playerIDs, numBots, boardSize, usernames)
	if err != nil {
		return nil, err
	}

	if game.GameID != nil {
		topic := fmt.Sprintf("game:%d", *game.GameID)
		s.publishIntegrationEvent(ctx, topic, "game:state", game)

		if s.timerService != nil {
			s.timerService.StartTimer(*game.GameID, game.Players, game.CurrentTurn)
		}

		// PlayBotTurn only ran after human MakeMove before — if turn 0 is a bot, nothing ever kicked off.
		if !game.IsGameOver() {
			currentPlayer := game.GetCurrentPlayer()
			if currentPlayer != nil && currentPlayer.UserID != nil && *currentPlayer.UserID < 0 {
				gid := *game.GameID
				go func() {
					if err := s.botService.PlayBotTurn(context.Background(), gid); err != nil {
						slog.Error("Bot turn failed at bot game start", "gameID", gid, "error", err)
					}
				}()
			}
		}
	}

	return game, nil
}

func (s *GameService) MakeMove(ctx context.Context, gameID, playerID, row, col int, edge string) (*Game, error) {
	isBotGame := s.botService.IsBotGame(gameID)

	edgeType, err := parseEdge(edge)
	if err != nil {
		return nil, err
	}

	var game *Game
	var result MoveResult
	var previousTurn int

	if isBotGame {
		err = s.botService.withGameExclusive(gameID, func(g *Game) error {
			game = g

			var turnOrder int
			found := false
			for _, p := range g.Players {
				if p.UserID != nil && *p.UserID == playerID {
					turnOrder = p.TurnOrder
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("player %d not in game", playerID)
			}

			move := Move{
				TurnOrder: turnOrder,
				Row:       row,
				Col:       col,
				Edge:      edgeType,
			}
			previousTurn = g.CurrentTurn
			var applyErr error
			result, applyErr = g.ApplyMove(move)
			return applyErr
		})
		if err != nil {
			return nil, fmt.Errorf("invalid move: %w", err)
		}
	} else {
		game, err = s.gameRepo.FindByID(ctx, gameID)
		if err != nil {
			return nil, fmt.Errorf("failed to load game: %w", err)
		}

		var turnOrder int
		found := false
		for _, p := range game.Players {
			if p.UserID != nil && *p.UserID == playerID {
				turnOrder = p.TurnOrder
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("player %d not in game", playerID)
		}

		previousTurn = game.CurrentTurn
		move := Move{
			TurnOrder: turnOrder,
			Row:       row,
			Col:       col,
			Edge:      edgeType,
		}
		result, err = game.ApplyMove(move)
		if err != nil {
			return nil, fmt.Errorf("invalid move: %w", err)
		}

		uncommitted := game.UncommittedEvents()
		if err := s.gameRepo.AppendEvents(ctx, gameID, uncommitted); err != nil {
			return nil, fmt.Errorf("failed to save events: %w", err)
		}
		game.ClearEvents()

		if err := s.gameRepo.UpdateProjection(ctx, game); err != nil {
			slog.Error("Failed to update projection", "gameID", gameID, "error", err)
		}
	}

	// Switch timer if turn changed
	if s.timerService != nil && result.NextTurn != previousTurn {
		s.timerService.SwitchTurn(*game.GameID, result.NextTurn)
	}

	slog.Info("Move applied",
		"gameID", *game.GameID,
		"playerID", playerID,
		"isBotGame", isBotGame,
		"boxesCompleted", len(result.CompletedBoxes),
		"gameOver", result.GameOver)

	// Publish integration event for WebSocket
	topic := fmt.Sprintf("game:%d", *game.GameID)
	s.publishIntegrationEvent(ctx, topic, "game:state", game)

	// If bot game and it's now a bot's turn, trigger bot moves (PlayBotTurn staggers each move).
	if isBotGame && !result.GameOver {
		currentPlayer := game.GetCurrentPlayer()
		if currentPlayer != nil && currentPlayer.UserID != nil && *currentPlayer.UserID < 0 {
			go func() {
				if err := s.botService.PlayBotTurn(context.Background(), *game.GameID); err != nil {
					slog.Error("Bot turn failed", "gameID", *game.GameID, "error", err)
				}
			}()
		}
	}

	if result.GameOver {
		if s.timerService != nil {
			s.timerService.StopTimer(*game.GameID)
		}
		s.publishIntegrationEvent(ctx, "global:games", "game_completed", map[string]interface{}{
			"game_id":   *game.GameID,
			"winner_id": game.WinnerID,
		})
	}

	return game, nil
}

// PassTurnOnTimeout advances the turn without a move when the per-turn clock expires (server-authoritative).
func (s *GameService) PassTurnOnTimeout(ctx context.Context, gameID int) (*Game, error) {
	isBotGame := s.botService.IsBotGame(gameID)

	var game *Game
	var result MoveResult
	var previousTurn int

	if isBotGame {
		err := s.botService.withGameExclusive(gameID, func(g *Game) error {
			game = g
			previousTurn = g.CurrentTurn
			r, err := g.PassTurnOnTimeout()
			result = r
			return err
		})
		if err != nil {
			return nil, fmt.Errorf("pass turn on timeout: %w", err)
		}
	} else {
		var err error
		game, err = s.gameRepo.FindByID(ctx, gameID)
		if err != nil {
			return nil, fmt.Errorf("failed to load game: %w", err)
		}

		previousTurn = game.CurrentTurn
		result, err = game.PassTurnOnTimeout()
		if err != nil {
			return nil, fmt.Errorf("pass turn on timeout: %w", err)
		}

		uncommitted := game.UncommittedEvents()
		if err := s.gameRepo.AppendEvents(ctx, gameID, uncommitted); err != nil {
			return nil, fmt.Errorf("failed to save timeout events: %w", err)
		}
		game.ClearEvents()

		if err := s.gameRepo.UpdateProjection(ctx, game); err != nil {
			slog.Error("Failed to update projection after timeout pass", "gameID", gameID, "error", err)
		}
	}

	if s.timerService != nil && result.NextTurn != previousTurn {
		s.timerService.SwitchTurn(*game.GameID, result.NextTurn)
	}

	slog.Info("Turn passed on timeout",
		"gameID", *game.GameID,
		"previousTurn", previousTurn,
		"nextTurn", result.NextTurn,
		"gameOver", result.GameOver)

	topic := fmt.Sprintf("game:%d", *game.GameID)
	s.publishIntegrationEvent(ctx, topic, "game:state", game)

	if isBotGame && !result.GameOver {
		currentPlayer := game.GetCurrentPlayer()
		if currentPlayer != nil && currentPlayer.UserID != nil && *currentPlayer.UserID < 0 {
			go func() {
				gid := *game.GameID
				if err := s.botService.PlayBotTurn(context.Background(), gid); err != nil {
					slog.Error("Bot turn failed after timeout pass", "gameID", gid, "error", err)
				}
			}()
		}
	}

	if result.GameOver {
		if s.timerService != nil {
			s.timerService.StopTimer(*game.GameID)
		}
		s.publishIntegrationEvent(ctx, "global:games", "game_completed", map[string]interface{}{
			"game_id":   *game.GameID,
			"winner_id": game.WinnerID,
		})
	}

	return game, nil
}

func (s *GameService) ForfeitGame(ctx context.Context, gameID, playerID int) (*Game, error) {
	isBotGame := s.botService.IsBotGame(gameID)

	var game *Game
	var err error

	if isBotGame {
		err = s.botService.withGameExclusive(gameID, func(g *Game) error {
			game = g
			if g.EndedAt != nil {
				return fmt.Errorf("game has already ended")
			}
			g.Forfeit(playerID)
			return nil
		})
		if err != nil {
			return nil, err
		}
	} else {
		game, err = s.gameRepo.FindByID(ctx, gameID)
		if err != nil {
			return nil, fmt.Errorf("failed to load game: %w", err)
		}

		if game.EndedAt != nil {
			return nil, fmt.Errorf("game has already ended")
		}

		game.Forfeit(playerID)

		uncommitted := game.UncommittedEvents()
		if err := s.gameRepo.AppendEvents(ctx, gameID, uncommitted); err != nil {
			return nil, fmt.Errorf("failed to save forfeit events: %w", err)
		}
		game.ClearEvents()

		if err := s.gameRepo.UpdateProjection(ctx, game); err != nil {
			slog.Error("Failed to update projection after forfeit", "gameID", gameID, "error", err)
		}
	}

	slog.Info("Game forfeited", "gameID", *game.GameID, "forfeitedBy", playerID, "winnerID", game.WinnerID)

	if s.timerService != nil {
		s.timerService.StopTimer(*game.GameID)
	}

	topic := fmt.Sprintf("game:%d", *game.GameID)
	s.publishIntegrationEvent(ctx, topic, "game:state", game)
	s.publishIntegrationEvent(ctx, "global:games", "game_completed", map[string]interface{}{
		"game_id":   *game.GameID,
		"winner_id": game.WinnerID,
	})

	return game, nil
}

// PublishLobbyGameStarted notifies lobby subscribers and each player on user:<id> so every
// browser session gets game:new (multi-tab / multi-window), not only the tab subscribed to lobby:<id>.
func (s *GameService) PublishLobbyGameStarted(ctx context.Context, lobbyID string, gameID int, playerIDs []int) {
	if lobbyID == "" {
		return
	}
	payload := map[string]interface{}{
		"gameID":   gameID,
		"lobby_id": lobbyID,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		slog.Error("Failed to marshal game:new payload", "error", err)
		return
	}

	lobbyTopic := "lobby:" + lobbyID
	lobbyEvt := events.Event{
		Topic:   lobbyTopic,
		Type:    "game:new",
		Payload: payloadBytes,
	}
	if err := s.bus.Publish(ctx, lobbyTopic, lobbyEvt); err != nil {
		slog.Error("failed to publish game:new to lobby", "lobbyID", lobbyID, "error", err)
	}

	for _, pid := range playerIDs {
		userTopic := fmt.Sprintf("user:%d", pid)
		userEvt := events.Event{
			Topic:   userTopic,
			Type:    "game:new",
			Payload: payloadBytes,
		}
		if err := s.bus.Publish(ctx, userTopic, userEvt); err != nil {
			slog.Error("failed to publish game:new to user", "userID", pid, "error", err)
		}
	}
}

// publishIntegrationEvent publishes a WebSocket integration event (separate from domain events).
func (s *GameService) publishIntegrationEvent(ctx context.Context, topic, eventType string, payload interface{}) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		slog.Error("Failed to marshal event payload", "type", eventType, "error", err)
		return
	}

	s.bus.Publish(ctx, topic, events.Event{
		Topic:   topic,
		Type:    eventType,
		Payload: payloadBytes,
	})
}

func parseEdge(edge string) (EdgeType, error) {
	switch edge {
	case "top_edge", "top":
		return TopEdge, nil
	case "right_edge", "right":
		return RightEdge, nil
	case "bottom_edge", "bottom":
		return BottomEdge, nil
	case "left_edge", "left":
		return LeftEdge, nil
	default:
		return "", fmt.Errorf("invalid edge: %s", edge)
	}
}
