import { useLayoutEffect, useRef } from "react";
import { Application, TextureStyle } from "pixi.js";
import { createFloatingPixelLayer } from "@/pixi/background/BackgroundLayer";

TextureStyle.defaultOptions.scaleMode = "nearest";

/** Matches choose-name / main menu dock chrome (`GameContainer` switches renderer to this after load). */
const LOBBY_PAGE_BG = 0x06060f as const;

/**
 * Full-viewport Pixi layer: dark pixel-game background + drifting 1–2px squares.
 * Pointer-events none — lobby UI stays fully interactive above (`z-10`).
 */
export function LobbyPixiBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    const app = new Application();
    let bundle: {
      app: Application;
      fx: ReturnType<typeof createFloatingPixelLayer>;
    } | null = null;

    void (async () => {
      try {
        await app.init({
          resizeTo: host,
          background: LOBBY_PAGE_BG,
          antialias: false,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          autoDensity: true,
          preference: "webgl",
          roundPixels: true,
        });
      } catch {
        return;
      }

      if (cancelled) {
        if (app.renderer) {
          app.destroy(
            { removeView: true, releaseGlobalResources: true },
            { children: true, texture: true, textureSource: true },
          );
        }
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.style.imageRendering = "pixelated";
      app.canvas.setAttribute("data-pixi", "lobby-backdrop");
      app.canvas.className =
        "pointer-events-none absolute inset-0 h-full w-full max-h-full max-w-full";

      const fx = createFloatingPixelLayer(app);
      app.stage.addChild(fx.container);

      if (cancelled) {
        fx.destroy();
        if (app.renderer) {
          app.destroy(
            { removeView: true, releaseGlobalResources: true },
            { children: true, texture: true, textureSource: true },
          );
        }
        return;
      }

      bundle = { app, fx };
    })();

    return () => {
      cancelled = true;
      if (bundle) {
        bundle.fx.destroy();
        if (bundle.app.renderer) {
          bundle.app.destroy(
            { removeView: true, releaseGlobalResources: true },
            { children: true, texture: true, textureSource: true },
          );
        }
        bundle = null;
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    />
  );
}
