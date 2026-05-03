/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: absolute API origin when UI and API are on different hosts (no trailing slash). */
  readonly VITE_API_ORIGIN?: string;
  /**
   * API origin used only to open WebSocket on the real backend (e.g. Render) when the page is on
   * another host (e.g. Vercel). Same value as your API public URL; no trailing slash.
   */
  readonly VITE_WS_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Pixi `package.json` exports `./dom` without `types`; map to the bundled declaration. */
declare module "pixi.js/dom" {
  export { DOMContainer } from "pixi.js/lib/dom/DOMContainer";
}
