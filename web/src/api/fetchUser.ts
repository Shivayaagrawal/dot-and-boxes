import type { QueryClient } from "@tanstack/react-query";
import { User } from "@/types/auth";
import axios from "axios";

const ME_STORAGE_KEY = "dnboxes_me";

function readCachedMe(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "userID" in parsed &&
      typeof (parsed as User).userID === "number" &&
      "username" in parsed &&
      typeof (parsed as User).username === "string"
    ) {
      return parsed as User;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Persist guest/session identity for reloads while GET /users/me is disabled. */
export function cacheMe(user: User): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ME_STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearCachedMe(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Default app flow: no password gate. If there is no session, create a guest and cache it as ["me"].
 * Call from `_authenticated` so `/play`, `/choose-name`, etc. always have a user.
 */
export async function ensureGuestSession(queryClient: QueryClient): Promise<void> {
  let user: User | null = null;
  try {
    user = await queryClient.ensureQueryData({
      queryKey: ["me"],
      queryFn: fetchUser,
      staleTime: 5 * 60 * 1000,
    });
  } catch {
    user = null;
  }
  if (!user) {
    const guest = await guestLogin();
    queryClient.setQueryData(["me"], guest);
  }
}

export async function guestLogin(preferredUsername?: string): Promise<User> {
  const body =
    preferredUsername !== undefined && preferredUsername.trim() !== ""
      ? { username: preferredUsername.trim() }
      : {};
  const response = await axios.post<User>(`/api/v1/guest`, body, {
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });
  cacheMe(response.data);
  return response.data;
}

/** Session from local cache (backend GET /users/me is commented out for guest-only mode). */
export async function fetchUser(): Promise<User | null> {
  return readCachedMe();
}
