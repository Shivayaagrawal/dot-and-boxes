import { create } from "zustand";

/** Pixi-facing scene id — routing stays in React; this drives overlays & future full-screen Pixi flows */
export type GameSceneId = "loading" | "mainMenu" | "lobby" | "game";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface LobbyPlayerView {
  userId: number;
  displayName: string;
  avatarUrl: string;
  isReady: boolean;
  /** Packed accent for Pixi slots */
  slotColor: number;
}

interface GameStoreState {
  currentScene: GameSceneId;
  connectionStatus: ConnectionStatus;
  /** Lobby roster keyed by `user_id` for stable WS merges */
  lobbyPlayers: Record<number, LobbyPlayerView>;
  setCurrentScene: (scene: GameSceneId) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLobbyPlayers: (players: Record<number, LobbyPlayerView>) => void;
  clearLobbyPlayers: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  currentScene: "loading",
  connectionStatus: "connecting",
  lobbyPlayers: {},
  setCurrentScene: (currentScene) => set({ currentScene }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setLobbyPlayers: (lobbyPlayers) => set({ lobbyPlayers }),
  clearLobbyPlayers: () => set({ lobbyPlayers: {} }),
}));
