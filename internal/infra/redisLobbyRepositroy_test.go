package infra_test

import (
	"context"
	"testing"
	"time"

	"dango/internal/infra"
	"dango/internal/lobby"
	"dango/internal/testutil"
)

func TestRedisLobbyRepository_CRUD(t *testing.T) {
	ctx := context.Background()
	client := testutil.RedisClientForTests(t)
	repo := infra.NewRedisLobbyRepository(client)

	testutil.ResetTestRedis(t, client)
	defer testutil.ResetTestRedis(t, client)

	l := &lobby.Lobby{
		LobbyID:     "lobby1",
		HostID:      123,
		Name:        "Test Lobby",
		PlayerLimit: 4,
		IsPrivate:   false,
		CreatedAt:   time.Now(),
		Players: []lobby.LobbyPlayer{
			{UserID: 123, IsReady: false},
		},
	}

	// --- CreateLobby ---
	if err := repo.CreateLobby(ctx, l); err != nil {
		t.Fatalf("CreateLobby failed: %v", err)
	}

	// --- GetLobby ---
	got, err := repo.GetLobby(ctx, l.LobbyID)
	if err != nil {
		t.Fatalf("GetLobby failed: %v", err)
	}
	if got == nil || got.LobbyID != l.LobbyID || got.HostID != l.HostID {
		t.Fatalf("GetLobby returned wrong data: %+v", got)
	}

	// --- Save (update) ---
	got.Name = "Updated Lobby"
	if err := repo.Save(ctx, got); err != nil {
		t.Fatalf("Save failed: %v", err)
	}
	updated, _ := repo.GetLobby(ctx, l.LobbyID)
	if updated.Name != "Updated Lobby" {
		t.Fatalf("Save did not persist changes: %+v", updated)
	}

	// --- GetAllLobbies ---
	all, err := repo.GetAllLobbies(ctx)
	if err != nil {
		t.Fatalf("GetAllLobbies failed: %v", err)
	}
	if len(all) != 1 || all[0].LobbyID != l.LobbyID {
		t.Fatalf("GetAllLobbies returned wrong data: %+v", all)
	}

	// --- DeleteLobby ---
	if err := repo.DeleteLobby(ctx, l.LobbyID); err != nil {
		t.Fatalf("DeleteLobby failed: %v", err)
	}
	deleted, _ := repo.GetLobby(ctx, l.LobbyID)
	if deleted != nil {
		t.Fatalf("Lobby should have been deleted, got: %+v", deleted)
	}

}
