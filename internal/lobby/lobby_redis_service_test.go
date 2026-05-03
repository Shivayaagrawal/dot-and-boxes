package lobby_test

import (
	"context"
	"fmt"
	"testing"

	"dango/internal/events"
	"dango/internal/infra"
	"dango/internal/lobby"
	"dango/internal/testutil"
)

func TestLobbyServiceWithRedisEventBus(t *testing.T) {
	ctx := context.Background()
	redisClient := testutil.RedisClientForTests(t)
	testutil.ResetTestRedis(t, redisClient)
	defer testutil.ResetTestRedis(t, redisClient)

	repo := infra.NewRedisLobbyRepository(redisClient)
	eventBus := infra.NewRedisEventBus(redisClient)

	service := lobby.NewLobbyService(repo, eventBus)

	// --- Create lobby ---
	lobbyObj, err := service.CreateLobby(ctx, 1, "Bob", "TestLobby", 2, false, 5)
	if err != nil {
		t.Fatal(err)
	}

	topic := fmt.Sprintf("lobby:%s", lobbyObj.LobbyID)
	err = eventBus.Subscribe(ctx, topic, func(e events.Event) {
		t.Logf("Received event: %s %s", e.Type, string(e.Payload))

	})

	if err != nil {
		t.Fatalf("subscribe failed: %v", err)
	}

	// --- Join player 2 ---
	if err := service.JoinLobby(ctx, lobbyObj.LobbyID, 2, "mandy"); err != nil {
		t.Fatal(err)
	}

	// --- Set player 2 ready ---
	if err := service.SetPlayerReady(ctx, lobbyObj.LobbyID, 2, true); err != nil {
		t.Fatal(err)
	}

	// --- Player 2 leaves (should trigger "player_left") ---
	if err := service.LeaveLobby(ctx, lobbyObj.LobbyID, 2); err != nil {
		t.Fatal(err)
	}

	// --- Host leaves (should trigger "lobby_deleted") ---
	if err := service.LeaveLobby(ctx, lobbyObj.LobbyID, 1); err != nil {
		t.Fatal(err)
	}

}
