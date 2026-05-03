import { useLayoutEffect, useRef, useState } from "react";
import {
  Application,
  BitmapFont,
  BitmapText,
  Container,
  Graphics,
} from "pixi.js";

/** Marketing splash: dismiss only after Pixi has painted at least once (not tied to /play boot). */
const MIN_SPLASH_MS = 1200;
/** Hard cap so a stuck GPU/driver cannot block the shell forever */
const MAX_SPLASH_MS = 7500;
/** If WebGL / font init fails (common on some localhost setups), keep CSS fallback visible briefly */
const MIN_FALLBACK_VISIBLE_MS = 1100;
const FONT_NAME = "DnBoxesPixelConsole";

/** Multicolor neon accents per console line */
const LINE_TINTS = [0xff006e, 0xfb5607, 0xffbe0b, 0x06ffa5] as const;

/** Extra vivid hues for 0–9 + % (cycle for digits) */
const RAINBOW = [
  0xff0080, 0xff6b00, 0xffea00, 0x7cff00, 0x00ffc8, 0x00b4ff, 0x8b5cff,
] as const;

const CONSOLE_LINES = [
  "Initializing engine...",
  "Loading assets...",
  "Connecting server...",
  "Ready.",
] as const;

/** Bitmap glyphs: periods + percent sign */
const FONT_CHARS: (string | [string, string])[] = [
  ["a", "z"],
  ["A", "Z"],
  ["0", "9"],
  " .,!:;-_%",
];

const CHAR_DELAY_MS = 32;
const LINE_GAP_MS = 160;

function barFillPalette(): number[] {
  return [0xff006e, 0x8338ec, 0x3a86ff, 0x06ffa5, 0xffbe0b, 0xfb5607];
}

async function waitForLayout(host: HTMLElement): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
      await document.fonts.load('600 10px "Press Start 2P"');
      await document.fonts.load('600 12px "Press Start 2P"');
    } catch {
      /* Courier fallback */
    }
  }
}

interface DeployLoadingOverlayProps {
  onComplete: () => void;
}

export function DeployLoadingOverlay({ onComplete }: DeployLoadingOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const finishedRef = useRef(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    const app = new Application();
    let resizeCleanup: (() => void) | undefined;
    let safetyTimer: number | undefined;
    let tick: (() => void) | undefined;

    const finish = () => {
      if (finishedRef.current || cancelled) return;
      finishedRef.current = true;
      if (tick) app.ticker.remove(tick);
      setFadeOut(true);
      window.setTimeout(() => {
        if (!cancelled) onComplete();
      }, 420);
    };

    const finishAfterMs = (ms: number) => {
      window.setTimeout(() => {
        if (!cancelled) finish();
      }, ms);
    };

    void (async () => {
      await waitForLayout(host);

      const vw = Math.max(320, host.clientWidth || window.innerWidth || 320);
      const vh = Math.max(
        480,
        host.clientHeight || window.innerHeight || 480,
      );

      try {
        await app.init({
          resizeTo: host,
          width: vw,
          height: vh,
          background: 0x0a0a0f,
          antialias: false,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          autoDensity: true,
          preference: "webgl",
          roundPixels: true,
        });
      } catch {
        finishAfterMs(MIN_FALLBACK_VISIBLE_MS);
        return;
      }

      if (cancelled) {
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
        return;
      }

      try {
        BitmapFont.uninstall(FONT_NAME);
      } catch {
        /* noop */
      }

      try {
        BitmapFont.install({
          name: FONT_NAME,
          style: {
            fontFamily: '"Press Start 2P", Courier New, Courier, monospace',
            fontSize: 11,
            fontWeight: "600",
            fill: "#f8fafc",
          },
          chars: FONT_CHARS,
          resolution: 1,
          textureStyle: {
            scaleMode: "nearest",
          },
        });
      } catch {
        try {
          BitmapFont.install({
            name: FONT_NAME,
            style: {
              fontFamily: "Courier New, Courier, monospace",
              fontSize: 12,
              fontWeight: "700",
              fill: "#f8fafc",
            },
            chars: FONT_CHARS,
            resolution: 1,
            textureStyle: { scaleMode: "nearest" },
          });
        } catch {
          finishAfterMs(MIN_FALLBACK_VISIBLE_MS);
          return;
        }
      }

      host.appendChild(app.canvas);
      app.canvas.style.imageRendering = "pixelated";

      const root = new Container();
      app.stage.addChild(root);

      const pixelScale = 2.5;
      root.scale.set(pixelScale);

      const ui = new Container();
      root.addChild(ui);

      const barOuterWpx = 252;
      const barOuterH = 12;
      const pad = 2;
      const segW = 4;
      const innerW = barOuterWpx - pad * 2;
      const innerH = barOuterH - pad * 2;
      const segments = Math.max(20, Math.floor(innerW / segW));
      const palette = barFillPalette();

      const lineHeight = 18;
      const lineTexts: BitmapText[] = CONSOLE_LINES.map((_, i) => {
        const bt = new BitmapText({
          text: "",
          style: {
            fontFamily: FONT_NAME,
            fontSize: 11,
            fill: 0xffffff,
            align: "left",
          },
        });
        bt.tint = LINE_TINTS[i] ?? 0xffffff;
        bt.roundPixels = true;
        bt.y = i * lineHeight;
        ui.addChild(bt);
        return bt;
      });

      const barGfx = new Graphics();

      const pctGap = 13;
      const pctRow = new Container();
      const pctChars: BitmapText[] = [];
      for (let i = 0; i < 4; i++) {
        const bt = new BitmapText({
          text: i === 3 ? "%" : "0",
          style: {
            fontFamily: FONT_NAME,
            fontSize: 11,
            fill: 0xffffff,
            align: "center",
          },
        });
        bt.roundPixels = true;
        bt.anchor.set(0.5, 0);
        bt.x = (i - 1.5) * pctGap;
        pctChars.push(bt);
        pctRow.addChild(bt);
      }

      const linesBlockH = CONSOLE_LINES.length * lineHeight;
      barGfx.y = linesBlockH + 10;
      pctRow.y = barGfx.y + barOuterH + 12;

      ui.addChild(barGfx);
      ui.addChild(pctRow);

      const blockH = pctRow.y + 22;

      const layout = () => {
        const rw = app.screen.width / pixelScale;
        const rh = app.screen.height / pixelScale;
        ui.position.set(rw / 2, rh / 2);
        ui.pivot.set(0, blockH / 2);
      };

      layout();
      const onResize = () => layout();
      app.renderer.on("resize", onResize);
      resizeCleanup = () => app.renderer.off("resize", onResize);

      const start = performance.now();
      let lineIndex = 0;
      let colInLine = 0;
      let nextEventAt = start;
      let pixiRenderedOnce = false;

      tick = () => {
        if (cancelled) return;
        pixiRenderedOnce = true;

        const elapsed = performance.now() - start;
        const now = performance.now();
        const p = Math.min(1, elapsed / MAX_SPLASH_MS);
        const pct = Math.min(100, Math.floor(p * 100));

        let burst = 0;
        while (
          lineIndex < CONSOLE_LINES.length &&
          now >= nextEventAt &&
          !cancelled &&
          burst < 32
        ) {
          burst++;
          const full = CONSOLE_LINES[lineIndex];
          if (!full) break;

          if (colInLine < full.length) {
            colInLine++;
            const bt = lineTexts[lineIndex];
            if (bt) bt.text = full.slice(0, colInLine);
            nextEventAt += CHAR_DELAY_MS;
          } else {
            lineIndex++;
            colInLine = 0;
            nextEventAt += LINE_GAP_MS;
          }
        }

        const str = `${String(pct).padStart(3, "0")}%`;
        for (let i = 0; i < 4; i++) {
          const ch = pctChars[i];
          if (ch) {
            ch.text = str[i] ?? "";
            const hueIdx =
              (i + pct + Math.floor(elapsed / 280)) % RAINBOW.length;
            ch.tint = RAINBOW[hueIdx] ?? 0xffffff;
          }
        }

        barGfx.clear();
        const ox = -barOuterWpx / 2;
        const frameIdx = Math.floor((elapsed / 400) % palette.length);
        const frameColor = palette[frameIdx] ?? 0xffffff;
        barGfx
          .rect(ox, 0, barOuterWpx, barOuterH)
          .stroke({ width: 2, color: frameColor, alpha: 0.95 });

        const filledSeg = Math.floor(p * segments);
        const x0 = ox + pad;
        for (let i = 0; i < filledSeg; i++) {
          const c = palette[(i + frameIdx) % palette.length]!;
          const x = x0 + i * segW;
          const wSeg = Math.min(segW - 0.5, x0 + innerW - x);
          if (wSeg <= 0.25) break;
          barGfx.rect(x, pad, wSeg, innerH).fill({ color: c, alpha: 0.95 });
        }

        const minTimePassed = elapsed >= MIN_SPLASH_MS;
        const pastCap = elapsed >= MAX_SPLASH_MS;
        if ((pixiRenderedOnce && minTimePassed) || pastCap) {
          finish();
        }
      };

      app.ticker.add(tick);

      safetyTimer = window.setTimeout(() => {
        if (!cancelled && !finishedRef.current) finish();
      }, MAX_SPLASH_MS + 1000);
    })();

    return () => {
      cancelled = true;
      if (safetyTimer !== undefined) window.clearTimeout(safetyTimer);
      resizeCleanup?.();
      try {
        BitmapFont.uninstall(FONT_NAME);
      } catch {
        /* noop */
      }
      if (app.renderer) {
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
      }
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] min-h-dvh w-full bg-[#0a0a0f] transition-opacity duration-300 ease-out ${
        fadeOut ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={fadeOut}
    >
      <span className="sr-only">
        Loading zero to one hundred percent. Initializing engine and assets.
      </span>
      <div
        className={`pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 font-mono transition-opacity duration-200 ${
          fadeOut ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      >
        <span
          className="text-[10px] text-pink-500 sm:text-xs"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          LOADING
        </span>
        <span className="text-[9px] text-cyan-400/80">000%</span>
      </div>
      <div
        ref={hostRef}
        className="absolute inset-0 box-border min-h-dvh w-full [&_canvas]:block [&_canvas]:h-full [&_canvas]:min-h-dvh [&_canvas]:w-full [&_canvas]:max-w-full"
      />
    </div>
  );
}
