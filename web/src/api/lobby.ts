import axios from "axios";
import { Lobby, CreateLobbyData } from "@/types/lobby";

/** Echo handlers often return `{ "error": "..." }`; some use `message`. */
export function axiosApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }
  const d = error.response?.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const o = d as Record<string, unknown>;
    const msg = o.error ?? o.message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  if (error.message && error.message !== "Network Error") {
    return error.message;
  }
  return fallback;
}

export async function fetchLobbies(): Promise<Lobby[]> {
  try {
    const response = await axios.get<Lobby[]>("/api/v1/lobbies", {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(axiosApiErrorMessage(error, "Failed to fetch lobbies"));
    }
    throw error;
  }
}

export async function fetchLobby(lobbyId: string): Promise<Lobby> {
  try {
    const response = await axios.get<Lobby>(`/api/v1/lobbies/${lobbyId}`, {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error("Lobby not found");
    }
    if (axios.isAxiosError(error)) {
      throw new Error(axiosApiErrorMessage(error, "Failed to fetch lobby"));
    }
    throw error;
  }
}

export async function createLobby(data: CreateLobbyData): Promise<Lobby> {
  try {
    const response = await axios.post<Lobby>("/api/v1/lobbies", data, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(axiosApiErrorMessage(error, "Failed to create lobby"));
    }
    throw error;
  }
}

export async function joinLobby(lobbyId: string): Promise<Lobby> {
  try {
    const response = await axios.post<Lobby>(
      `/api/v1/lobbies/${lobbyId}/join`,
      {},
      {
        withCredentials: true,
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(axiosApiErrorMessage(error, "Failed to join lobby"));
    }
    throw error;
  }
}

export async function leaveLobby(lobbyId: string): Promise<void> {
  try {
    await axios.post(
      `/api/v1/lobbies/${lobbyId}/leave`,
      {},
      {
        withCredentials: true,
      },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(axiosApiErrorMessage(error, "Failed to leave lobby"));
    }
    throw error;
  }
}

/** POST toggles `is_ready` for the current user (must already be in the lobby). */
export async function toggleLobbyReady(lobbyId: string): Promise<Lobby> {
  try {
    const response = await axios.post<Lobby>(
      `/api/v1/lobbies/${encodeURIComponent(lobbyId)}/ready`,
      {},
      { withCredentials: true },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        axiosApiErrorMessage(error, "Failed to toggle ready"),
      );
    }
    throw error;
  }
}
