import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Application, Container, TextureStyle } from "pixi.js";
import type { CreateLobbyData } from "@/types/lobby";
import {
  installLobbyBitmapFont,
  uninstallLobbyBitmapFont,
} from "@/pixi/mainMenu/installLobbyBitmapFont";
import {
  createMainMenuScene,
  MENU_DEFAULT_BOARD_SIZE,
  type MainMenuDockCallbacks,
} from "@/pixi/mainMenu/MainMenuScene";
import type { MainMenuSceneController } from "@/pixi/mainMenu/MainMenuScene";
import { SceneManager } from "@/pixi/SceneManager";
import {
  createLoadingScene,
  LOADING_SCENE_BACKGROUND_COLOR,
} from "@/pixi/scenes/LoadingScene";
import { useGameStore } from "@/stores/gameStore";
import { PixiLoaderPersistent } from "@/components/PixiLoaderPersistent";

TextureStyle.defaultOptions.scaleMode = "nearest";

async function waitForLayout(host: HTMLElement): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
      await document.fonts.load('600 10px "Press Start 2P"');
    } catch {
      /* Courier fallback */
    }
  }
}

export interface GameContainerProps {
  displayName: string;
  guestNames?: readonly string[];
  onYourName?: () => void;
  onBotGame: () => void;
  onOnlineMultiplayer: () => void;
  onLobbyCreateSubmit: (data: CreateLobbyData) => void | Promise<void>;
  /** While the create-lobby API request is in flight (Pixi submit button state). */
  lobbyCreatePending?: boolean;
  /** Initial board size in the create form (5–10); defaults to main-menu constant. */
  defaultBoardSize?: number;
  dock?: MainMenuDockCallbacks;
  initialSoundMuted?: boolean;
  initialMusicMuted?: boolean;
  chatBadgeCount?: number;
  readyHighlighted?: boolean;
  /** Increment (e.g. from `/play?create=1`) to open the Pixi create-lobby overlay once the scene is ready. */
  openCreateLobbyNonce?: number;
  className?: string;
}

export function GameContainer({
  displayName,
  guestNames = [],
  onYourName,
  onBotGame,
  onOnlineMultiplayer,
  onLobbyCreateSubmit,
  lobbyCreatePending = false,
  defaultBoardSize = MENU_DEFAULT_BOARD_SIZE,
  dock,
  initialSoundMuted = false,
  initialMusicMuted = false,
  chatBadgeCount = 0,
  readyHighlighted = false,
  openCreateLobbyNonce = 0,
  className,
}: GameContainerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MainMenuSceneController | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);

  /** Local only — avoids global Zustand bootPhase leaking across Strict Mode unmounts (blank lobby). */
  const [pixiLobbyReady, setPixiLobbyReady] = useState(false);

  const propsRef = useRef({
    onYourName,
    onBotGame,
    onOnlineMultiplayer,
    onLobbyCreateSubmit,
    defaultBoardSize,
    dock,
    initialSoundMuted,
    initialMusicMuted,
  });
  propsRef.current = {
    onYourName,
    onBotGame,
    onOnlineMultiplayer,
    onLobbyCreateSubmit,
    defaultBoardSize,
    dock,
    initialSoundMuted,
    initialMusicMuted,
  };

  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const guestNamesRef = useRef(guestNames);
  guestNamesRef.current = guestNames;

  const dockRef = useRef(dock);
  dockRef.current = dock;

  const setCurrentScene = useGameStore((s) => s.setCurrentScene);

  const stableDockDispatch = useMemo<MainMenuDockCallbacks>(
    () => ({
      play: () => dockRef.current?.play(),
      home: () => dockRef.current?.home(),
      list: () => dockRef.current?.list(),
      refresh: () => dockRef.current?.refresh(),
      ready: () => dockRef.current?.ready(),
      chat: () => dockRef.current?.chat(),
      trophy: () => dockRef.current?.trophy(),
      gear: () => dockRef.current?.gear(),
      sound: () => dockRef.current?.sound(),
      music: () => dockRef.current?.music(),
    }),
    [],
  );

  const [pixiFailed, setPixiFailed] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    const app = new Application();
    setPixiLobbyReady(false);
    setCurrentScene("loading");

    void (async () => {
      await waitForLayout(host);

      try {
        await app.init({
          resizeTo: host,
          background: LOADING_SCENE_BACKGROUND_COLOR,
          antialias: false,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          autoDensity: true,
          preference: "webgl",
          roundPixels: true,
        });
      } catch {
        if (!cancelled) {
          setPixiFailed(true);
          setPixiLobbyReady(true);
          setCurrentScene("mainMenu");
        }
        return;
      }

      if (cancelled) {
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
        return;
      }

      if (!installLobbyBitmapFont()) {
        if (!cancelled) {
          setPixiFailed(true);
          setPixiLobbyReady(true);
          setCurrentScene("mainMenu");
        }
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.style.imageRendering = "pixelated";
      app.canvas.setAttribute("data-pixi", "true");

      const mount = new Container();
      app.stage.addChild(mount);

      const sm = new SceneManager(mount);
      sceneManagerRef.current = sm;
      sm.switch(createLoadingScene(app));

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      let scene: MainMenuSceneController;
      try {
        scene = createMainMenuScene(app, {
          callbacks: {
            onYourName: () => propsRef.current.onYourName?.(),
            onBotGame: () => propsRef.current.onBotGame(),
            onOnlineMultiplayer: () => propsRef.current.onOnlineMultiplayer(),
            onLobbyCreateSubmit: (data) =>
              propsRef.current.onLobbyCreateSubmit(data),
          },
          initialDisplayName: displayNameRef.current,
          guestSeed: guestNamesRef.current,
          dock: propsRef.current.dock ? stableDockDispatch : undefined,
          initialSoundMuted: propsRef.current.initialSoundMuted,
          initialMusicMuted: propsRef.current.initialMusicMuted,
          defaultBoardSize: propsRef.current.defaultBoardSize,
        });
      } catch {
        if (!cancelled) {
          setPixiFailed(true);
          setPixiLobbyReady(true);
          setCurrentScene("mainMenu");
        }
        app.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
        return;
      }

      sceneRef.current = scene;
      sm.switch({ root: scene.root, destroy: () => scene.destroy() });
      app.renderer.background.color = 0x06060f;
      appRef.current = app;
      setCurrentScene("mainMenu");
      if (!cancelled) {
        setPixiLobbyReady(true);
      }
    })();

    return () => {
      cancelled = true;
      setPixiLobbyReady(false);
      setCurrentScene("loading");
      sceneRef.current = null;
      sceneManagerRef.current?.destroy();
      sceneManagerRef.current = null;
      uninstallLobbyBitmapFont();
      const live = appRef.current ?? app;
      if (live?.renderer) {
        live.destroy(
          { removeView: true, releaseGlobalResources: true },
          { children: true, texture: true, textureSource: true },
        );
      }
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; callbacks via refs
  }, [setCurrentScene, stableDockDispatch]);

  useLayoutEffect(() => {
    sceneRef.current?.setDisplayName(displayName);
  }, [displayName]);

  useLayoutEffect(() => {
    sceneRef.current?.setGuestNames(guestNames);
  }, [guestNames]);

  useLayoutEffect(() => {
    sceneRef.current?.setChatBadge(chatBadgeCount);
  }, [chatBadgeCount]);

  useLayoutEffect(() => {
    sceneRef.current?.setReadyHighlighted(readyHighlighted);
  }, [readyHighlighted]);

  useLayoutEffect(() => {
    sceneRef.current?.setSoundMuted(initialSoundMuted);
  }, [initialSoundMuted]);

  useLayoutEffect(() => {
    sceneRef.current?.setMusicMuted(initialMusicMuted);
  }, [initialMusicMuted]);

  useLayoutEffect(() => {
    sceneRef.current?.setLobbyCreatePending(lobbyCreatePending);
  }, [lobbyCreatePending]);

  const openLobbyNonceRef = useRef(0);
  useLayoutEffect(() => {
    if (openCreateLobbyNonce <= 0 || !pixiLobbyReady) return;
    const scene = sceneRef.current;
    if (!scene) return;
    if (openCreateLobbyNonce === openLobbyNonceRef.current) return;
    openLobbyNonceRef.current = openCreateLobbyNonce;
    scene.openCreateLobbyOverlay();
  }, [openCreateLobbyNonce, pixiLobbyReady]);

  /**
   * React may clear imperative DOM children on parent re-renders; Pixi's canvas is appended
   * outside React's tree — re-attach whenever the host lost it (fixes blank lobby after data updates).
   */
  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = appRef.current?.canvas;
    if (!host || !canvas) return;
    if (canvas.parentElement !== host) {
      host.appendChild(canvas);
    }
  });

  return (
    <div
      id="pixi-root"
      ref={hostRef}
      className={
        className ??
        "relative box-border min-h-dvh w-full flex-1 bg-[#06060f] [&_canvas]:block [&_canvas]:h-full [&_canvas]:min-h-dvh [&_canvas]:w-full [&_canvas]:max-w-full"
      }
    >
      {!pixiFailed && !pixiLobbyReady ? (
        <div className="absolute inset-0 z-6 flex min-h-full min-w-full flex-col overflow-hidden">
          <PixiLoaderPersistent />
        </div>
      ) : null}
      {pixiFailed ? (
        <div className="relative z-8 flex min-h-dvh items-center justify-center bg-[#06060f] px-4 font-mono text-sm text-rose-300">
          Could not start the pixel lobby (WebGL or font init failed). Reload the
          page or try another browser.
        </div>
      ) : null}
    </div>
  );
}
