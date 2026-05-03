package websocket

import (
	"context"
	"dango/internal/events"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"sync"
)

var (
	ErrEventNotSupported = errors.New("this event type is not supported")
)

type subscribeRequest struct {
	topic string
	conn  *Connection
}

// Manager holds connections and Events possible
type Manager struct {
	connections   ConnectionList
	rooms         map[string]ConnectionList
	userConns     map[int]ConnectionList // all WS sessions per user (multi-tab / multi-window)
	subscribedBus map[string]bool // topics with active EventBus goroutines
	register      chan *Connection
	unregister    chan *Connection
	broadcast     chan BroadcastEvent
	eventBus      events.EventBus
	subscribe     chan subscribeRequest
	mu            sync.RWMutex
}

func NewManager(eventBus events.EventBus) *Manager {
	m := &Manager{
		connections:   make(ConnectionList),
		userConns:     make(map[int]ConnectionList),
		rooms:         make(map[string]ConnectionList),
		subscribedBus: make(map[string]bool),
		eventBus:      eventBus,
		register:      make(chan *Connection),
		unregister:    make(chan *Connection),
		broadcast:     make(chan BroadcastEvent, 100),
		subscribe:     make(chan subscribeRequest, 100),
	}
	return m
}

func (m *Manager) Run() {
	for {
		select {
		case conn := <-m.register:
			m.mu.Lock()
			if m.userConns[conn.userID] == nil {
				m.userConns[conn.userID] = make(ConnectionList)
			}
			sessions := m.userConns[conn.userID]
			firstSession := len(sessions) == 0
			sessions[conn] = true
			sessionCount := len(sessions)
			m.mu.Unlock()

			m.connections[conn] = true
			slog.Info("Connection registered",
				"userID", conn.userID,
				"sessionsForUser", sessionCount,
				"totalConns", len(m.connections))

			if firstSession {
				m.eventBus.Publish(context.Background(), "connections", events.Event{
					Topic:   "connections",
					Type:    "user_connected",
					Payload: json.RawMessage(fmt.Sprintf(`{"user_id":%d}`, conn.userID)),
				})
			}

		case conn := <-m.unregister:
			delete(m.connections, conn)

			var lastSession bool
			m.mu.Lock()
			if sessions, ok := m.userConns[conn.userID]; ok {
				delete(sessions, conn)
				if len(sessions) == 0 {
					delete(m.userConns, conn.userID)
					lastSession = true
				}
			}
			m.mu.Unlock()

			if lastSession {
				m.eventBus.Publish(context.Background(), "connections", events.Event{
					Topic:   "connections",
					Type:    "user_disconnected",
					Payload: json.RawMessage(fmt.Sprintf(`{"user_id":%d}`, conn.userID)),
				})
			}
			m.UnsubscribeAll(conn)

		case req := <-m.subscribe:
			if m.rooms[req.topic] == nil {
				m.rooms[req.topic] = make(ConnectionList)
			}
			// Only start one EventBus goroutine per topic, ever.
			// subscribedBus persists even when the room empties, preventing
			// duplicate Redis subscriptions across reconnects.
			if !m.subscribedBus[req.topic] {
				m.subscribedBus[req.topic] = true
				slog.Info("Created new EventBus subscription", "topic", req.topic)
				go m.subscribeToEventBus(req.topic)
			}
			m.rooms[req.topic][req.conn] = true
			slog.Info("Connection subscribed to topic",
				"topic", req.topic,
				"userID", req.conn.userID,
				"roomSize", len(m.rooms[req.topic]))

		case msg := <-m.broadcast:
			slog.Debug("Broadcasting message",
				"topic", msg.Topic,
				"type", msg.Type)
			if conns, ok := m.rooms[msg.Topic]; ok {
				for conn := range conns {
					conn.Send(msg)
				}
			}
		}
	}
}

func (m *Manager) subscribeToEventBus(topic string) {
	err := m.eventBus.Subscribe(context.Background(), topic, func(e events.Event) {
		slog.Debug("Event received from EventBus",
			"topic", e.Topic,
			"type", e.Type)

		be := BroadcastEvent{
			Topic:   e.Topic,
			Type:    e.Type,
			Payload: e.Payload,
		}

		select {
		case m.broadcast <- be:
		default:
			slog.Warn("Broadcast channel full, dropping event",
				"topic", topic,
				"type", e.Type)
		}
	})

	if err != nil {
		slog.Error("Failed to subscribe to EventBus", "topic", topic, "error", err)
	} else {
		slog.Info("Manager subscribed to EventBus topic", "topic", topic)
	}
}

func (m *Manager) Broadcast(topic string, eventType string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		slog.Error("failed to marshal broadcast payload", "error", err)
		return
	}

	m.broadcast <- BroadcastEvent{
		Topic:   topic,
		Type:    eventType,
		Payload: data,
	}
}

func (m *Manager) Subscribe(topic string, conn *Connection) {
	m.subscribe <- subscribeRequest{
		topic: topic,
		conn:  conn,
	}
}

func (m *Manager) Unsubscribe(topic string, conn *Connection) {
	if conns, ok := m.rooms[topic]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(m.rooms, topic)
		}
	}
}

func (m *Manager) UnsubscribeAll(conn *Connection) {
	for topic := range m.rooms {
		m.Unsubscribe(topic, conn)
	}
}

func (m *Manager) SubscribeUser(userID int, topic string) {
	m.mu.RLock()
	sessions, ok := m.userConns[userID]
	if !ok || len(sessions) == 0 {
		m.mu.RUnlock()
		slog.Debug("User not connected, cannot subscribe", "userID", userID, "topic", topic)
		return
	}
	conns := make([]*Connection, 0, len(sessions))
	for c := range sessions {
		conns = append(conns, c)
	}
	m.mu.RUnlock()

	for _, c := range conns {
		m.Subscribe(topic, c)
	}
	slog.Info("User subscribed to topic", "userID", userID, "topic", topic, "sessions", len(conns))
}

func (m *Manager) GetStats() map[string]int {
	m.mu.RLock()
	userCount := len(m.userConns)
	m.mu.RUnlock()

	return map[string]int{
		"total_connections": len(m.connections),
		"total_rooms":       len(m.rooms),
		"total_users":       userCount,
	}
}
