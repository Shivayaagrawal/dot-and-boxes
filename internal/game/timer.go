package game

import (
	"context"
	"dango/internal/events"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"
)

const (
	// TurnTimeLimit is the server-authoritative duration for each turn (auto-pass when elapsed).
	TurnTimeLimit         = 5 * time.Second
	DisconnectGracePeriod = 30 * time.Second
	TimerTickInterval     = 100 * time.Millisecond
)

// TimerState represents the timer data sent to clients
type TimerState struct {
	GameID       int               `json:"game_id"`
	Players      []PlayerTimerInfo `json:"players"`
	ActiveTurn   int               `json:"active_turn"`
	TurnLimitMs  int64             `json:"turn_limit_ms"` // same as TurnTimeLimit; lets UI cap/countdown correctly
}

// PlayerTimerInfo represents timer info for a single player
type PlayerTimerInfo struct {
	TurnOrder    int   `json:"turn_order"`
	UserID       int   `json:"user_id"`
	RemainingMs  int64 `json:"remaining_ms"`
	Disconnected bool  `json:"disconnected"`
}

// GameTimer tracks per-turn deadline state for a single game.
type GameTimer struct {
	mu               sync.Mutex
	gameID           int
	playerUserIDs    map[int]int // turnOrder -> user_id (may be negative for bots)
	userIDToTurn     map[int]int // userID -> turnOrder (disconnect tracking)
	activeTurn       int
	turnEndsAt       time.Time
	disconnected     map[int]bool
	disconnectTimers map[int]*time.Timer
	stopped          bool
	stopChan         chan struct{}
}

// GameTimerService manages timers for all active games
type GameTimerService struct {
	mu          sync.RWMutex
	timers      map[int]*GameTimer
	bus         events.EventBus
	forfeitFn   func(ctx context.Context, gameID, playerID int) error
	passTurnFn  func(ctx context.Context, gameID int) error
}

// NewGameTimerService creates a new GameTimerService
func NewGameTimerService(bus events.EventBus) *GameTimerService {
	return &GameTimerService{
		timers: make(map[int]*GameTimer),
		bus:    bus,
	}
}

// SetForfeitFunc sets the function called when disconnect grace expires (still forfeits).
func (s *GameTimerService) SetForfeitFunc(fn func(ctx context.Context, gameID, playerID int) error) {
	s.forfeitFn = fn
}

// SetPassTurnFunc sets the function called when the per-turn deadline expires (advance turn, no edge).
func (s *GameTimerService) SetPassTurnFunc(fn func(ctx context.Context, gameID int) error) {
	s.passTurnFn = fn
}

// StartTimer initializes and starts a timer for a game
func (s *GameTimerService) StartTimer(gameID int, players []Player, startingTurn int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.timers[gameID]; exists {
		return
	}

	now := time.Now()
	timer := &GameTimer{
		gameID:           gameID,
		playerUserIDs:    make(map[int]int),
		userIDToTurn:     make(map[int]int),
		activeTurn:       startingTurn,
		turnEndsAt:       now.Add(TurnTimeLimit),
		disconnected:     make(map[int]bool),
		disconnectTimers: make(map[int]*time.Timer),
		stopChan:         make(chan struct{}),
	}

	for _, p := range players {
		if p.UserID != nil {
			timer.playerUserIDs[p.TurnOrder] = *p.UserID
			timer.userIDToTurn[*p.UserID] = p.TurnOrder
		}
	}

	s.timers[gameID] = timer

	go timer.run(s)

	slog.Info("Game timer started", "gameID", gameID, "players", len(players), "turnLimit", TurnTimeLimit)
}

// SwitchTurn resets the deadline when the active seat changes (after a move or timeout pass).
func (s *GameTimerService) SwitchTurn(gameID, newTurn int) {
	s.mu.RLock()
	timer, exists := s.timers[gameID]
	s.mu.RUnlock()

	if !exists {
		return
	}

	timer.mu.Lock()
	defer timer.mu.Unlock()

	if timer.stopped || timer.activeTurn == newTurn {
		return
	}

	timer.activeTurn = newTurn
	timer.turnEndsAt = time.Now().Add(TurnTimeLimit)
}

// StopTimer stops and removes a game timer
func (s *GameTimerService) StopTimer(gameID int) {
	s.mu.Lock()
	timer, exists := s.timers[gameID]
	if !exists {
		s.mu.Unlock()
		return
	}
	delete(s.timers, gameID)
	s.mu.Unlock()

	timer.mu.Lock()
	defer timer.mu.Unlock()

	if !timer.stopped {
		timer.stopped = true
		close(timer.stopChan)
	}

	for _, t := range timer.disconnectTimers {
		t.Stop()
	}

	slog.Info("Game timer stopped", "gameID", gameID)
}

// HandleDisconnect starts a 30s grace period for a disconnected player
func (s *GameTimerService) HandleDisconnect(userID int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, timer := range s.timers {
		timer.mu.Lock()
		if _, inGame := timer.userIDToTurn[userID]; inGame {
			timer.disconnected[userID] = true

			if existing, ok := timer.disconnectTimers[userID]; ok {
				existing.Stop()
			}

			gameID := timer.gameID
			timer.disconnectTimers[userID] = time.AfterFunc(DisconnectGracePeriod, func() {
				s.handleDisconnectTimeout(gameID, userID)
			})

			slog.Info("Player disconnected, starting 30s grace period",
				"userID", userID, "gameID", timer.gameID)
		}
		timer.mu.Unlock()
	}
}

// HandleReconnect cancels the disconnect grace period
func (s *GameTimerService) HandleReconnect(userID int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, timer := range s.timers {
		timer.mu.Lock()
		if _, inGame := timer.userIDToTurn[userID]; inGame {
			timer.disconnected[userID] = false

			if t, ok := timer.disconnectTimers[userID]; ok {
				t.Stop()
				delete(timer.disconnectTimers, userID)
			}

			slog.Info("Player reconnected, grace period cancelled",
				"userID", userID, "gameID", timer.gameID)
		}
		timer.mu.Unlock()
	}
}

// GetTimerState returns the current timer state for a game
func (s *GameTimerService) GetTimerState(gameID int) *TimerState {
	s.mu.RLock()
	timer, exists := s.timers[gameID]
	s.mu.RUnlock()

	if !exists {
		return nil
	}

	return timer.buildState()
}

// HasTimer checks if a game has an active timer
func (s *GameTimerService) HasTimer(gameID int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.timers[gameID]
	return exists
}

func (s *GameTimerService) handleDisconnectTimeout(gameID, userID int) {
	slog.Info("Disconnect grace period expired, forfeiting",
		"gameID", gameID, "userID", userID)

	if s.forfeitFn != nil {
		if err := s.forfeitFn(context.Background(), gameID, userID); err != nil {
			slog.Error("Failed to forfeit on disconnect timeout",
				"gameID", gameID, "userID", userID, "error", err)
		}
	}

	s.StopTimer(gameID)
}

func (t *GameTimer) run(service *GameTimerService) {
	ticker := time.NewTicker(TimerTickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if t.tick(service) {
				return
			}
		case <-t.stopChan:
			return
		}
	}
}

func (t *GameTimer) tick(service *GameTimerService) bool {
	now := time.Now()

	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return true
	}

	expired := now.After(t.turnEndsAt)
	gameID := t.gameID
	t.mu.Unlock()

	if expired {
		if service.passTurnFn != nil {
			if err := service.passTurnFn(context.Background(), gameID); err != nil {
				slog.Warn("Pass turn on deadline failed", "gameID", gameID, "error", err)
			}
		}
		return false
	}

	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return true
	}
	state := t.buildStateLocked()
	t.mu.Unlock()

	service.publishTimerState(state)
	return false
}

func (t *GameTimer) buildState() *TimerState {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.buildStateLocked()
}

func (t *GameTimer) buildStateLocked() *TimerState {
	remainingActive := time.Until(t.turnEndsAt)
	if remainingActive < 0 {
		remainingActive = 0
	}

	state := &TimerState{
		GameID:      t.gameID,
		ActiveTurn:  t.activeTurn,
		TurnLimitMs: TurnTimeLimit.Milliseconds(),
	}

	orders := make([]int, 0, len(t.playerUserIDs))
	for to := range t.playerUserIDs {
		orders = append(orders, to)
	}
	sort.Ints(orders)

	for _, turnOrder := range orders {
		uid := t.playerUserIDs[turnOrder]
		var ms int64
		if turnOrder == t.activeTurn {
			ms = remainingActive.Milliseconds()
		}
		state.Players = append(state.Players, PlayerTimerInfo{
			TurnOrder:    turnOrder,
			UserID:       uid,
			RemainingMs:  ms,
			Disconnected: t.disconnected[uid],
		})
	}

	return state
}

func (s *GameTimerService) publishTimerState(state *TimerState) {
	topic := fmt.Sprintf("game:%d", state.GameID)

	payload, err := json.Marshal(state)
	if err != nil {
		slog.Error("Failed to marshal timer state", "error", err)
		return
	}

	s.bus.Publish(context.Background(), topic, events.Event{
		Topic:   topic,
		Type:    events.EventGameTimer,
		Payload: payload,
	})
}

// ListenForConnectionEvents subscribes to connection events for disconnect/reconnect handling
func (s *GameTimerService) ListenForConnectionEvents() {
	err := s.bus.Subscribe(context.Background(), "connections", func(e events.Event) {
		var payload struct {
			UserID int `json:"user_id"`
		}
		if err := json.Unmarshal(e.Payload, &payload); err != nil {
			slog.Error("Failed to unmarshal connection event", "error", err)
			return
		}

		switch e.Type {
		case "user_disconnected":
			s.HandleDisconnect(payload.UserID)
		case "user_connected":
			s.HandleReconnect(payload.UserID)
		}
	})

	if err != nil {
		slog.Error("Failed to subscribe to connection events", "error", err)
	}
}
