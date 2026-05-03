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

/** Absolute URL for a path that starts with `/` (e.g. `/api/v1/...`). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${p}` : p;
}

/** WebSocket URL for real-time API (session cookie must match this host). */
export function getWebSocketUrl(): string {
  if (API_ORIGIN) {
    const u = new URL(API_ORIGIN);
    const wsScheme = u.protocol === "https:" ? "wss" : "ws";
    return `${wsScheme}://${u.host}/api/v1/ws`;
  }
  const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${wsScheme}://${window.location.host}/api/v1/ws`;
}
