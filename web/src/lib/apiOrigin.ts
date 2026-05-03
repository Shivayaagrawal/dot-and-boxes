/**
 * Optional absolute API origin when the UI must call the API on another host.
 * Leave unset for: Vite dev proxy, or Vercel `vercel.json` rewrite of `/api/*` → backend
 * (recommended so session + CSRF cookies stay on the same site as the page).
 *
 * If you set this to your Render URL, the browser and API are different sites: the `_csrf`
 * cookie is not readable from JS on the Vercel origin, so CSRF-protected POSTs will fail
 * unless you change the backend or proxy `/api` through Vercel.
 *
 * No trailing slash.
 */
export const API_ORIGIN =
  (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ??
  "";

/**
 * When the UI is served on a different host than the API (e.g. Vercel static + Render API),
 * Vercel rewrites cannot complete WebSocket upgrades to the backend. Set this to the **API**
 * base URL (same as your Render service, no trailing slash). The app will fetch `/api/v1/ws-token`
 * same-origin (through the rewrite), then open `wss://<this host>/api/v1/ws?token=...`.
 *
 * Leave unset for local dev, Docker, or any setup where WS is same-origin (cookie works).
 */
export const WS_DIRECT_ORIGIN =
  (import.meta.env.VITE_WS_ORIGIN as string | undefined)?.replace(/\/$/, "") ??
  "";

/** Absolute URL for a path that starts with `/` (e.g. `/api/v1/...`). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${p}` : p;
}

/** WebSocket URL when the connection is same-origin with the API (cookie auth). */
export function getWebSocketUrl(): string {
  if (API_ORIGIN) {
    const u = new URL(API_ORIGIN);
    const wsScheme = u.protocol === "https:" ? "wss" : "ws";
    return `${wsScheme}://${u.host}/api/v1/ws`;
  }
  const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${wsScheme}://${window.location.host}/api/v1/ws`;
}

/**
 * Resolves the WebSocket URL. When `VITE_WS_ORIGIN` is set, obtains a bridge token from the
 * same-origin API and connects to the API host with `?token=` (cross-origin WS).
 */
export async function getWebSocketUrlAsync(): Promise<string> {
  if (WS_DIRECT_ORIGIN) {
    const res = await fetch(apiUrl("/api/v1/ws-token"), { credentials: "include" });
    if (!res.ok) {
      throw new Error(`ws-token failed: ${res.status}`);
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      throw new Error("ws-token: missing token");
    }
    const base = new URL(WS_DIRECT_ORIGIN);
    const wsScheme = base.protocol === "https:" ? "wss:" : "ws:";
    const q = new URLSearchParams({ token: data.token });
    return `${wsScheme}//${base.host}/api/v1/ws?${q.toString()}`;
  }
  return getWebSocketUrl();
}
