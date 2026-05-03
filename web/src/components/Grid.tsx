import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Application, Container, FederatedPointerEvent } from "pixi.js";
import { createFloatingPixelLayer } from "@/pixi/background/BackgroundLayer";
import { rebuildBoardContent } from "@/pixi/renderBoard";
import { Box as BoxType } from "@/types/websocket";

interface GridProps {
  gameID: number;
  boxes: BoxType[];
  userColors: Record<number, string>;
  boardSize: number;
  userID: number;
  handleClick: (
    gameID: number,
    userID: number,
    row: number,
    col: number,
    edge: "top_edge" | "left_edge" | "right_edge" | "bottom_edge",
  ) => void;
  turnToUserIdMap: Record<number, number>;
  /** Thicker / brighter Pixi strokes for claimable edges on your turn */
  isMyTurn?: boolean;
}

const BOX = 70;
const PAD = 5;

function dimensions(boardSize: number) {
  const fullW = BOX * boardSize + 2 * PAD;
  const fullH = BOX * boardSize + 2 * PAD;
  const baseX = -PAD;
  const baseY = -PAD;
  return { fullW, fullH, baseX, baseY };
}

function initialScale(boardSize: number) {
  return boardSize > 10 ? boardSize / 10 : 1;
}

function clampView(
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  baseX: number,
  baseY: number,
  fullW: number,
  fullH: number,
) {
  const maxVx = baseX + fullW - vw;
  const maxVy = baseY + fullH - vh;
  return {
    vx: Math.min(Math.max(vx, baseX), maxVx),
    vy: Math.min(Math.max(vy, baseY), maxVy),
  };
}

const Grid = ({
  gameID,
  boxes = [],
  userColors,
  boardSize,
  userID,
  handleClick,
  turnToUserIdMap,
  isMyTurn = false,
}: GridProps) => {
  const { fullW, fullH, baseX, baseY } = useMemo(
    () => dimensions(boardSize),
    [boardSize],
  );

  const minScale = 1;
  const maxScale = Math.max(1, boardSize);

  const makeInitialView = useCallback(() => {
    const s = initialScale(boardSize);
    const vw = fullW / s;
    const vh = fullH / s;
    const vx = baseX + (fullW - vw) / 2;
    const vy = baseY + (fullH - vh) / 2;
    return clampView(vx, vy, vw, vh, baseX, baseY, fullW, fullH);
  }, [boardSize, fullW, fullH, baseX, baseY]);

  const [scale, setScale] = useState(() => initialScale(boardSize));
  const [viewMin, setViewMin] = useState(() => makeInitialView());

  const scaleRef = useRef(scale);
  const viewMinRef = useRef(viewMin);
  scaleRef.current = scale;
  viewMinRef.current = viewMin;

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const cameraRef = useRef<Container | null>(null);
  const contentRef = useRef<Container | null>(null);
  const panRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);

  const handleClickRef = useRef(handleClick);
  handleClickRef.current = handleClick;

  const [resizeVersion, bumpResize] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const init = makeInitialView();
    const s = initialScale(boardSize);
    setScale(s);
    setViewMin(init);
    scaleRef.current = s;
    viewMinRef.current = init;
  }, [gameID, boardSize, makeInitialView]);

  const applyZoomAtClientPoint = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const vm = viewMinRef.current;
      const sc = scaleRef.current;
      const vwLocal = fullW / sc;
      const vhLocal = fullH / sc;

      const rect = canvas.getBoundingClientRect();
      const tX = (clientX - rect.left) / rect.width;
      const tY = (clientY - rect.top) / rect.height;

      const worldX = vm.vx + tX * vwLocal;
      const worldY = vm.vy + tY * vhLocal;

      const s = Math.min(Math.max(nextScale, minScale), maxScale);
      const newVw = fullW / s;
      const newVh = fullH / s;

      const nx = worldX - tX * newVw;
      const ny = worldY - tY * newVh;
      const c = clampView(nx, ny, newVw, newVh, baseX, baseY, fullW, fullH);
      setScale(s);
      setViewMin(c);
      scaleRef.current = s;
      viewMinRef.current = c;
    },
    [fullW, fullH, baseX, baseY, minScale, maxScale],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => bumpResize());
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const app = new Application();
    let wheelCleanup: (() => void) | undefined;
    let floatingBackdrop: ReturnType<typeof createFloatingPixelLayer> | undefined;

    void (async () => {
      await app.init({
        resizeTo: hostRef.current ?? undefined,
        width: hostRef.current?.clientWidth ?? 400,
        height: hostRef.current?.clientHeight ?? 400,
        background: 0xf5ead8,
        antialias: false,
        resolution: Math.min(
          2,
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        ),
        autoDensity: true,
        preference: "webgl",
        roundPixels: true,
      });

      if (cancelled) {
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
        return;
      }

      const host = hostRef.current;
      if (!host) {
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
        return;
      }

      host.appendChild(app.canvas);
      canvasRef.current = app.canvas;
      appRef.current = app;

      app.resizeTo = host;

      floatingBackdrop = createFloatingPixelLayer(app);
      app.stage.addChild(floatingBackdrop.container);

      const camera = new Container();
      const content = new Container();
      camera.addChild(content);
      app.stage.addChild(camera);
      cameraRef.current = camera;
      contentRef.current = content;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        applyZoomAtClientPoint(
          e.clientX,
          e.clientY,
          scaleRef.current * factor,
        );
      };

      app.canvas.addEventListener("wheel", onWheel, { passive: false });
      wheelCleanup = () => {
        app.canvas.removeEventListener("wheel", onWheel);
      };

      bumpResize();
    })();

    return () => {
      cancelled = true;
      wheelCleanup?.();
      floatingBackdrop?.destroy();
      canvasRef.current = null;
      appRef.current = null;
      cameraRef.current = null;
      contentRef.current = null;
      if (app.renderer) {
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
      }
    };
  }, [gameID, applyZoomAtClientPoint]);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || ev.pointerId !== pan.pointerId) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dx = ev.clientX - pan.lastX;
      const dy = ev.clientY - pan.lastY;
      pan.lastX = ev.clientX;
      pan.lastY = ev.clientY;

      const sc = scaleRef.current;
      const vwPan = fullW / sc;
      const vhPan = fullH / sc;

      const dvx = (-dx / rect.width) * vwPan;
      const dvy = (-dy / rect.height) * vhPan;

      setViewMin((prev) => {
        const next = clampView(
          prev.vx + dvx,
          prev.vy + dvy,
          vwPan,
          vhPan,
          baseX,
          baseY,
          fullW,
          fullH,
        );
        viewMinRef.current = next;
        return next;
      });
    };

    const onEnd = (ev: PointerEvent) => {
      if (panRef.current?.pointerId === ev.pointerId) {
        panRef.current = null;
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [fullW, fullH, baseX, baseY]);

  const onPanPointerDown = useCallback((e: FederatedPointerEvent) => {
    const pe = e.nativeEvent as PointerEvent;
    if (pe.button !== 0) return;
    panRef.current = {
      pointerId: pe.pointerId,
      lastX: pe.clientX,
      lastY: pe.clientY,
    };
  }, []);

  useLayoutEffect(() => {
    const app = appRef.current;
    const camera = cameraRef.current;
    if (!app?.renderer || !camera) return;

    try {
      const bw = app.screen.width;
      const bh = app.screen.height;
      if (!bw || !bh) return;

      const vm = viewMin;
      const sc = scale;
      const vwCam = fullW / sc;
      const vhCam = fullH / sc;

      camera.scale.set(bw / vwCam, bh / vhCam);
      camera.position.set(-vm.vx * (bw / vwCam), -vm.vy * (bh / vhCam));
    } catch {
      /* renderer may be tearing down */
    }
  }, [viewMin, scale, fullW, fullH, resizeVersion]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    rebuildBoardContent(content, {
      boxes,
      boardDimension: boardSize,
      boxSize: BOX,
      baseX,
      baseY,
      fullW,
      fullH,
      userColors,
      turnToUserIdMap,
      gameID,
      userID,
      onEdgeClick: (...args) => handleClickRef.current(...args),
      onPanPointerDown,
      emphasizeSelectableEdges: isMyTurn,
    });
  }, [
    boxes,
    userColors,
    turnToUserIdMap,
    gameID,
    userID,
    baseX,
    baseY,
    fullW,
    fullH,
    onPanPointerDown,
    resizeVersion,
    isMyTurn,
  ]);

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    applyZoomAtClientPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      scaleRef.current * factor,
    );
  };

  const resetView = () => {
    const init = makeInitialView();
    const s = initialScale(boardSize);
    setScale(s);
    setViewMin(init);
    scaleRef.current = s;
    viewMinRef.current = init;
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-amber-800/90">
        <span className="hidden font-['Press_Start_2P'] uppercase tracking-wide sm:inline">
          Pinch · scroll · drag
        </span>
        <span className="font-['Press_Start_2P'] uppercase tracking-wide sm:hidden">
          Zoom · drag
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="cursor-pointer border-4 border-amber-900/50 bg-amber-950/90 px-2 py-1 font-['Press_Start_2P'] text-[7px] uppercase tracking-wide text-amber-100 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] hover:bg-amber-900"
            onClick={() => zoomBy(0.85)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="cursor-pointer border-4 border-amber-900/50 bg-amber-950/90 px-2 py-1 font-['Press_Start_2P'] text-[7px] uppercase tracking-wide text-amber-100 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] hover:bg-amber-900"
            onClick={() => zoomBy(1.15)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="cursor-pointer border-4 border-stone-600 bg-stone-800 px-2 py-1 font-['Press_Start_2P'] text-[7px] uppercase tracking-wide text-stone-200 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] hover:bg-stone-700"
            onClick={resetView}
            aria-label="Reset view"
          >
            ⟲
          </button>
        </div>
      </div>

      <div className="mx-auto aspect-square w-full max-w-[min(100%,720px)] touch-none overflow-hidden rounded-sm border-[6px] border-[#5c4033] bg-[#3d291d] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.06),8px_8px_0_0_rgba(0,0,0,0.35)] select-none">
        <div
          ref={hostRef}
          className="w-full h-full [&_canvas]:block [&_canvas]:w-full [&_canvas]:h-full"
        />
      </div>
    </div>
  );
};

export default Grid;
