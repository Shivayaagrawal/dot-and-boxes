package game

import (
	"context"
	"dango/internal/events"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"sync"
	"time"
)

// botMoveDelay is a pause before each bot plays so the prior turn’s line + timer read clearly (not instant snap).
const botMoveDelay = 900 * time.Millisecond

// BotService handles bot-specific game logic
type BotService struct {
	mu       sync.RWMutex
	botGames map[int]*Game
	nextID   int
	bus      events.EventBus
}

// NewBotService creates a new BotService
func NewBotService(bus events.EventBus) *BotService {
	return &BotService{
		botGames: make(map[int]*Game),
		nextID:   10000,
		bus:      bus,
	}
}

// CreateBotGame creates a new in-memory bot game
func (b *BotService) CreateBotGame(playerIDs []int, numBots int, boardSize int, usernames map[int]string) (*Game, error) {
	if boardSize < 5 || boardSize > 10 {
		return nil, fmt.Errorf("invalid board size: must be between 5 and 10, got: %d", boardSize)
	}

	if len(playerIDs) == 0 {
		return nil, fmt.Errorf("must provide at least one human player")
	}

	// numBots is how many AI opponents join; total seats = humans + bots (matches UI "N bots → N+1 players").
	totalPlayers := len(playerIDs) + numBots
	if totalPlayers < 2 || totalPlayers > 4 {
		return nil, fmt.Errorf("invalid roster: %d human(s) + %d bot(s) = %d players (need 2-4)", len(playerIDs), numBots, totalPlayers)
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	// Create players (human + bots)
	players := make([]Player, 0, len(playerIDs)+numBots)

	// Add human players
	for _, id := range playerIDs {
		username := usernames[id]
		if username == "" {
			username = fmt.Sprintf("Player%d", id)
		}
		players = append(players, Player{
			UserID:      &id,
			Username:    username,
			TurnOrder:   len(players),
			IsAnonymous: false,
			Score:       0,
		})
	}

	// Add bot players
	for i := 0; i < numBots; i++ {
		botID := -(i + 1) // negative IDs for bots: -1, -2, etc.
		players = append(players, Player{
			UserID:      &botID,
			Username:    fmt.Sprintf("Bot%d", i+1),
			TurnOrder:   len(players),
			IsAnonymous: false,
			Score:       0,
		})
	}

	// Shuffle seating order so no fixed seat has structural first-move advantage.
	rngPlayers := rand.New(rand.NewSource(time.Now().UnixNano()))
	rngPlayers.Shuffle(len(players), func(i, j int) {
		players[i], players[j] = players[j], players[i]
	})
	for i := range players {
		players[i].TurnOrder = i
	}

	// Generate bot game ID
	gameID := b.nextID
	b.nextID++

	// Create game using domain model
	game := NewGame(&gameID, boardSize, players)

	// Store in memory
	b.botGames[gameID] = game

	slog.Info("Created bot game",
		"gameID", gameID,
		"players", len(players),
		"boardSize", boardSize,
	)

	return game, nil
}

// withGameExclusive runs fn while holding the bot-game mutex (serializes human HTTP moves and bot play).
func (b *BotService) withGameExclusive(gameID int, fn func(*Game) error) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	g := b.botGames[gameID]
	if g == nil {
		return fmt.Errorf("bot game %d not found", gameID)
	}
	return fn(g)
}

// PlayBotTurn executes bot moves until turn passes to the human or the game ends.
// Mutations are serialized with human MakeMove via the same mutex.
// Each bot waits botMoveDelay (lock released) before moving so turns are visible and not simultaneous.
func (b *BotService) PlayBotTurn(ctx context.Context, gameID int) error {
	for {
		b.mu.Lock()
		game := b.botGames[gameID]
		if game == nil {
			b.mu.Unlock()
			return fmt.Errorf("bot game %d not found", gameID)
		}

		if game.IsGameOver() {
			b.mu.Unlock()
			break
		}

		currentPlayer := game.GetCurrentPlayer()
		if currentPlayer == nil {
			b.mu.Unlock()
			return fmt.Errorf("no current player found")
		}

		if currentPlayer.UserID == nil || *currentPlayer.UserID >= 0 {
			b.mu.Unlock()
			break
		}

		b.mu.Unlock()
		time.Sleep(botMoveDelay)

		b.mu.Lock()
		game = b.botGames[gameID]
		if game == nil {
			b.mu.Unlock()
			return fmt.Errorf("bot game %d not found", gameID)
		}
		if game.IsGameOver() {
			b.mu.Unlock()
			break
		}

		currentPlayer = game.GetCurrentPlayer()
		if currentPlayer == nil {
			b.mu.Unlock()
			return fmt.Errorf("no current player found")
		}
		if currentPlayer.UserID == nil || *currentPlayer.UserID >= 0 {
			b.mu.Unlock()
			break
		}

		botID := *currentPlayer.UserID
		move := game.GenerateBotMove(currentPlayer.TurnOrder)
		if move == nil {
			slog.Warn("Bot has no valid moves, advancing turn", "gameID", gameID, "botID", botID)
			game.CurrentTurn = (game.CurrentTurn + 1) % len(game.Players)
			b.mu.Unlock()
			continue
		}

		result, err := game.ApplyMove(*move)
		if err != nil {
			slog.Error("Bot move failed", "gameID", gameID, "botID", botID, "error", err)
			b.mu.Unlock()
			break
		}

		b.mu.Unlock()

		slog.Info("Bot made move",
			"gameID", gameID,
			"botID", botID,
			"row", move.Row,
			"col", move.Col,
			"edge", move.Edge,
			"boxesCompleted", len(result.CompletedBoxes))

		b.publishGameState(ctx, gameID, game)

		if result.GameOver {
			break
		}
	}

	b.mu.RLock()
	game := b.botGames[gameID]
	b.mu.RUnlock()
	if game != nil {
		b.publishGameState(ctx, gameID, game)
		if game.IsGameOver() {
			b.publishGameCompleted(ctx, gameID, game.WinnerID)
			slog.Info("Bot game finished", "gameID", gameID, "winner", game.WinnerID)
		}
	}

	return nil
}

func (b *BotService) publishGameState(ctx context.Context, gameID int, game *Game) {
	topic := fmt.Sprintf("game:%d", gameID)

	payloadBytes, err := json.Marshal(game)
	if err != nil {
		slog.Error("Failed to marshal game state", "gameID", gameID, "error", err)
		return
	}

	b.bus.Publish(ctx, topic, events.Event{
		Topic:   topic,
		Type:    "game:state",
		Payload: payloadBytes,
	})
}

func (b *BotService) publishGameCompleted(ctx context.Context, gameID int, winnerID *int) {
	payloadBytes, err := json.Marshal(map[string]interface{}{
		"game_id":   gameID,
		"winner_id": winnerID,
	})
	if err != nil {
		slog.Error("Failed to marshal game completed event", "gameID", gameID, "error", err)
		return
	}

	b.bus.Publish(ctx, "global:games", events.Event{
		Topic:   "global:games",
		Type:    "game_completed",
		Payload: payloadBytes,
	})
}

// GetBotGameState returns the in-memory bot game state
func (b *BotService) GetBotGameState(gameID int) (*Game, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	game, ok := b.botGames[gameID]
	if !ok {
		return nil, fmt.Errorf("bot game %d not found", gameID)
	}

	return game, nil
}

// DeleteBotGame removes a finished bot game
func (b *BotService) DeleteBotGame(gameID int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.botGames, gameID)
	slog.Info("Deleted bot game", "gameID", gameID)
}

// IsBotGame checks if a game ID is a bot game
func (b *BotService) IsBotGame(gameID int) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	_, ok := b.botGames[gameID]
	return ok
}
