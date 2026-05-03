import { useEffect } from "react";
import { useWebSocket } from "@/WebSocketContext";
import { useGameStore, type LobbyPlayerView } from "@/stores/gameStore";
import { MAIN_MENU_PLAYER_COLORS } from "@/pixi/mainMenu/MainMenuScene";
import type { Lobby } from "@/types/lobby";

/**
 * Bridges WebSocket lifecycle + lobby snapshots into the shared Zustand store for Pixi observers.
 */
export function useGameWebSocketBridge(myLobby: Lobby | undefined): void {
  const { connected } = useWebSocket();
  const setConnectionStatus = useGameStore((s) => s.setConnectionStatus);
  const setLobbyPlayers = useGameStore((s) => s.setLobbyPlayers);
  const clearLobbyPlayers = useGameStore((s) => s.clearLobbyPlayers);

  useEffect(() => {
    setConnectionStatus(connected ? "connected" : "disconnected");
  }, [connected, setConnectionStatus]);

  useEffect(() => {
    const players = myLobby?.players;
    if (!players?.length) {
      clearLobbyPlayers();
      return;
    }

    const next: Record<number, LobbyPlayerView> = {};
    players.forEach((p, i) => {
      next[p.user_id] = {
        userId: p.user_id,
        displayName: p.username?.trim() || `PLAYER ${p.user_id}`,
        avatarUrl: p.avatarUrl ?? "",
        isReady: p.is_ready,
        slotColor: MAIN_MENU_PLAYER_COLORS[i % MAIN_MENU_PLAYER_COLORS.length]!,
      };
    });
    setLobbyPlayers(next);
  }, [myLobby, clearLobbyPlayers, setLobbyPlayers]);
}
