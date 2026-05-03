/** Session-only label shown on the Pixi main menu (does not replace server username). */
export const LOBBY_DISPLAY_SESSION_KEY = "dnboxes_lobby_display";

/**
 * Once per browser session: user has passed the “choose lobby display name” step so `/play`
 * can mount the Pixi lobby (avoids a long loading shell before any UI).
 */
const LOBBY_PROMPT_DONE_SESSION_KEY = "dnboxes_lobby_prompt_done";

export function hasCompletedLobbyNamePrompt(): boolean {
  try {
    return sessionStorage.getItem(LOBBY_PROMPT_DONE_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

export function markLobbyNamePromptComplete(): void {
  try {
    sessionStorage.setItem(LOBBY_PROMPT_DONE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function readLobbyDisplayName(): string {
  try {
    return sessionStorage.getItem(LOBBY_DISPLAY_SESSION_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeLobbyDisplayName(name: string): void {
  try {
    const t = name.trim().slice(0, 24);
    if (t === "") {
      sessionStorage.removeItem(LOBBY_DISPLAY_SESSION_KEY);
    } else {
      sessionStorage.setItem(LOBBY_DISPLAY_SESSION_KEY, t);
    }
  } catch {
    /* ignore */
  }
}
