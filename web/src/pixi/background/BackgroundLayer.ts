import type { Application } from "pixi.js";
import { Container } from "pixi.js";
import { FloatingPixels } from "./FloatingPixels";

export interface FloatingPixelLayerHandle {
  readonly container: Container;
  readonly destroy: () => void;
}

/**
 * Floating-pixel overlay for full-screen game scenes (main menu, lobby, etc.).
 * Keep off the loading screen — that scene uses a flat pixel-shaded backdrop only.
 */
export function createFloatingPixelLayer(
  app: Application,
  particleCount?: number,
): FloatingPixelLayerHandle {
  const fx = new FloatingPixels(app, particleCount);
  return {
    container: fx.container,
    destroy: () => fx.destroy(),
  };
}
