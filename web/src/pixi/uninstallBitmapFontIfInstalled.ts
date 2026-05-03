import { BitmapFont, Cache } from "pixi.js";

/** Pixi stores dynamic bitmap fonts under `${name}-bitmap` (see BitmapFontManager). */
function bitmapFontCacheKey(name: string): string {
  return `${name}-bitmap`;
}

/**
 * Remove a bitmap font without triggering PixiJS Cache.get() warnings when it was never installed.
 */
export function uninstallBitmapFontIfInstalled(name: string): void {
  if (!Cache.has(bitmapFontCacheKey(name))) return;
  BitmapFont.uninstall(name);
}
