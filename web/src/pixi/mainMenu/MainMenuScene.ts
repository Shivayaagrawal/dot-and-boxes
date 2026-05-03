import "pixi.js/dom";
import {
  Application,
  BitmapText,
  Container,
  Graphics,
  Texture,
  TextureStyle,
  TilingSprite,
} from "pixi.js";
import { DOMContainer } from "pixi.js/dom";
import { createFloatingPixelLayer } from "@/pixi/background/BackgroundLayer";
import {
  CartoonCircleButton,
  type CartoonCircleColors,
  type CartoonIconKind,
} from "./CartoonCircleButton";
import { LOBBY_FONT_NAME } from "./installLobbyBitmapFont";
import { PixelButton } from "./PixelButton";
import { PlayerSlot } from "./PlayerSlot";
import { assignUniqueDisplayNames } from "./uniquePlayerNames";
import { LobbyCreateSchema, clampBoardApi } from "@/lib/lobbyCreateForm";
import type { CreateLobbyData } from "@/types/lobby";
import { buildLobbyCreateDomForm } from "./createLobbyDomForm";

TextureStyle.defaultOptions.scaleMode = "nearest";

/** Shared with Zustand ↔ Pixi slot coloring */
export const MAIN_MENU_PLAYER_COLORS = [0xe63946, 0x457b9d, 0x2a9d8f] as const;
const PLAYER_COLORS = MAIN_MENU_PLAYER_COLORS;

/** Default board dimension for API calls from `/play` (5–10 allowed server-side). */
export const MENU_DEFAULT_BOARD_SIZE = 10;

export interface MainMenuCallbacks {
  onYourName: () => void;
  onBotGame: () => void;
  onOnlineMultiplayer: () => void;
  /** Same payload as POST /api/v1/lobbies — wired from React `handleCreateLobby`. */
  onLobbyCreateSubmit: (data: CreateLobbyData) => void | Promise<void>;
}

/** Glossy circular toolbar — wired from `/play` (home, chat, ready API, etc.). */
export interface MainMenuDockCallbacks {
  play: () => void;
  home: () => void;
  list: () => void;
  refresh: () => void;
  ready: () => void;
  chat: () => void;
  trophy: () => void;
  gear: () => void;
  sound: () => void;
  music: () => void;
}

export interface MainMenuSceneController {
  root: Container;
  setDisplayName: (name: string) => void;
  setGuestNames: (names: readonly string[]) => void;
  setChatBadge: (n: number) => void;
  setReadyHighlighted: (on: boolean) => void;
  setSoundMuted: (muted: boolean) => void;
  setMusicMuted: (muted: boolean) => void;
  setLobbyCreatePending: (pending: boolean) => void;
  /** Opens the create-lobby overlay (e.g. site nav → `/play?create=1`). */
  openCreateLobbyOverlay: () => void;
  destroy: () => void;
}

const BUTTON_W = 248;
const BUTTON_H = 44;
const SLOT_W = 248;

const DOCK_R = 16;
const DOCK_GAP = 40;

const DOCK_PALETTE: Record<
  keyof MainMenuDockCallbacks,
  CartoonCircleColors
> = {
  play: {
    face: 0xffe066,
    rim: 0x7f1d1d,
    icon: 0x5c0a0a,
    glint: 0xffffff,
  },
  home: {
    face: 0x7dd3fc,
    rim: 0x023e8a,
    icon: 0x032174,
    glint: 0xffffff,
  },
  list: {
    face: 0xffd6a5,
    rim: 0x9d0208,
    icon: 0x6a0404,
    glint: 0xffffff,
  },
  refresh: {
    face: 0xb8f2e6,
    rim: 0x1d3557,
    icon: 0x0d1b2a,
    glint: 0xffffff,
  },
  ready: {
    face: 0xcaffbf,
    rim: 0x1b4332,
    icon: 0x081c15,
    glint: 0xffffff,
  },
  chat: {
    face: 0xffafcc,
    rim: 0x9d174d,
    icon: 0x5f0f40,
    glint: 0xffffff,
  },
  trophy: {
    face: 0xffd700,
    rim: 0x7c5800,
    icon: 0x4a3706,
    glint: 0xffffff,
  },
  gear: {
    face: 0xe0e7ff,
    rim: 0x3730a3,
    icon: 0x1e1b4b,
    glint: 0xffffff,
  },
  sound: {
    face: 0xa8dadc,
    rim: 0x1d3557,
    icon: 0x0b1320,
    glint: 0xffffff,
  },
  music: {
    face: 0xffc8dd,
    rim: 0x880d4e,
    icon: 0x4a0e1f,
    glint: 0xffffff,
  },
};

function makeTileTexture(app: Application): Texture {
  const tile = new Graphics();
  const s = 48;
  tile.rect(0, 0, s, s).fill({ color: 0x10102a });
  tile.rect(0, 0, s, 3).fill({ color: 0x4ecdc4, alpha: 0.06 });
  tile.rect(0, 12, 3, s - 12).fill({ color: 0xff6b9d, alpha: 0.05 });
  const tex = app.renderer.generateTexture({
    target: tile,
    resolution: 1,
    textureSourceOptions: { scaleMode: "nearest" },
  });
  tile.destroy();
  return tex;
}

/**
 * Full-screen lobby layout: animated backdrop, title, menu column, player roster.
 */
export function createMainMenuScene(
  app: Application,
  options: {
    callbacks: MainMenuCallbacks;
    initialDisplayName: string;
    guestSeed?: readonly string[];
    dock?: MainMenuDockCallbacks;
    initialSoundMuted?: boolean;
    initialMusicMuted?: boolean;
    /** Default board dimension when opening create lobby (5–10); same as React modal. */
    defaultBoardSize?: number;
  },
): MainMenuSceneController {
  const root = new Container();

  const baseBg = new Graphics();
  root.addChild(baseBg);

  const tileTex = makeTileTexture(app);
  const tiling = new TilingSprite({
    texture: tileTex,
    width: app.screen.width,
    height: app.screen.height,
  });
  tiling.alpha = 0.28;
  tiling.eventMode = "none";
  root.addChild(tiling);

  const floatingPixels = createFloatingPixelLayer(app);
  root.addChild(floatingPixels.container);

  const uiRoot = new Container();
  root.addChild(uiRoot);

  const pixelScale = 2;
  uiRoot.scale.set(pixelScale);

  const defaultBoardForForm = options.defaultBoardSize ?? MENU_DEFAULT_BOARD_SIZE;

  const createLobbyOverlay = new Container();
  createLobbyOverlay.visible = false;
  createLobbyOverlay.sortableChildren = true;
  createLobbyOverlay.eventMode = "static";

  const backdrop = new Graphics();
  backdrop.eventMode = "static";
  backdrop.cursor = "pointer";

  /** Centers the HTML card; DOM must include buttons (DOM layers above canvas). */
  const panelWrap = new Container();
  panelWrap.eventMode = "static";

  let domForm!: ReturnType<typeof buildLobbyCreateDomForm>;

  let lobbyCreatePending = false;

  const closeCreateLobby = (): void => {
    if (lobbyCreatePending) return;
    createLobbyOverlay.visible = false;
    domForm.setError("");
  };

  const handleCreateLobbySubmit = (): void => {
    if (lobbyCreatePending) return;
    domForm.setError("");
    const raw = domForm.getValues();
    const parsed = LobbyCreateSchema.safeParse({
      name: raw.name.trim(),
      player_limit: Number(raw.player_limit),
      board_size: clampBoardApi(Number(raw.board_size)),
      is_private: raw.is_private,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid";
      domForm.setError(msg);
      return;
    }
    void Promise.resolve(
      options.callbacks.onLobbyCreateSubmit(parsed.data),
    ).catch((e: unknown) => {
      domForm.setError(
        e instanceof Error ? e.message : "Failed to create lobby",
      );
    });
  };

  domForm = buildLobbyCreateDomForm({
    onCancel: closeCreateLobby,
    onSubmit: handleCreateLobbySubmit,
  });
  domForm.reset(defaultBoardForForm);

  const domContainer = new DOMContainer({
    element: domForm.root,
    anchor: { x: 0.5, y: 0.5 },
  });

  const applyLobbyCreatePending = (): void => {
    domForm.setLobbyCreatePending(lobbyCreatePending);
  };

  const openCreateLobby = (): void => {
    domForm.reset(defaultBoardForForm);
    domForm.setError("");
    createLobbyOverlay.visible = true;
    layoutCreateLobbyOverlay();
    requestAnimationFrame(() => domForm.focusName());
  };

  function layoutCreateLobbyOverlay(): void {
    const sw = app.screen.width;
    const sh = app.screen.height;
    backdrop.clear();
    backdrop.rect(0, 0, sw, sh).fill({ color: 0x06060f, alpha: 0.88 });

    panelWrap.position.set(sw / 2, sh / 2);
  }

  backdrop.on("pointertap", () => {
    closeCreateLobby();
  });

  panelWrap.addChild(domContainer);
  createLobbyOverlay.addChild(backdrop, panelWrap);
  root.addChild(createLobbyOverlay);

  domForm.root.tabIndex = -1;
  domForm.root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCreateLobby();
  });

  const title = new BitmapText({
    text: "DOTS & BOXES",
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 14,
      fill: 0xfff1c8,
      align: "center",
    },
  });
  title.roundPixels = true;
  title.anchor.set(0.5, 0);
  uiRoot.addChild(title);

  const menuCol = new Container();
  uiRoot.addChild(menuCol);

  const btnYourName = new PixelButton({
    label: "YOUR NAME",
    width: BUTTON_W,
    height: BUTTON_H,
    fontSize: 9,
    style: { face: 0x8b5a2b, highlight: 0xf4d69b, shadow: 0x3e2723, border: 0x22140c },
    onPress: () => options.callbacks.onYourName(),
  });

  const btnBot = new PixelButton({
    label: "BOT GAME",
    width: BUTTON_W,
    height: BUTTON_H,
    fontSize: 9,
    style: { face: 0x2d6a4f, highlight: 0xb7e4c7, shadow: 0x1b4332, border: 0x0f291d },
    onPress: () => options.callbacks.onBotGame(),
  });

  const btnOnline = new PixelButton({
    label: "ONLINE MULTIPLAYER",
    width: BUTTON_W,
    height: BUTTON_H,
    fontSize: 7,
    style: { face: 0x1d3557, highlight: 0xa8dadc, shadow: 0x0b1320, border: 0x050810 },
    onPress: () => options.callbacks.onOnlineMultiplayer(),
  });

  const btnLobby = new PixelButton({
    label: "CREATE LOBBY",
    width: BUTTON_W,
    height: BUTTON_H,
    fontSize: 9,
    style: { face: 0x9d0208, highlight: 0xffb4a2, shadow: 0x370617, border: 0x240005 },
    onPress: () => openCreateLobby(),
  });

  menuCol.addChild(btnYourName, btnBot, btnOnline, btnLobby);

  const dockCircles: CartoonCircleButton[] = [];
  let chatDock: CartoonCircleButton | undefined;
  let readyDock: CartoonCircleButton | undefined;
  let soundDock: CartoonCircleButton | undefined;
  let musicDock: CartoonCircleButton | undefined;
  const dockContainer = new Container();
  uiRoot.addChild(dockContainer);

  if (options.dock) {
    const d = options.dock;
    const row1: {
      paletteKey: keyof MainMenuDockCallbacks;
      icon: CartoonIconKind;
      fn: () => void;
    }[] = [
      { paletteKey: "play", icon: "play", fn: d.play },
      { paletteKey: "home", icon: "home", fn: d.home },
      { paletteKey: "list", icon: "list", fn: d.list },
      { paletteKey: "refresh", icon: "refresh", fn: d.refresh },
      { paletteKey: "ready", icon: "check", fn: d.ready },
      { paletteKey: "chat", icon: "chat", fn: d.chat },
      { paletteKey: "trophy", icon: "trophy", fn: d.trophy },
      { paletteKey: "gear", icon: "gear", fn: d.gear },
    ];
    row1.forEach((spec, i) => {
      const btn = new CartoonCircleButton({
        kind: spec.icon,
        radius: DOCK_R,
        colors: DOCK_PALETTE[spec.paletteKey],
        phaseOffset: i * 0.65,
        onPress: spec.fn,
      });
      dockCircles.push(btn);
      dockContainer.addChild(btn);
      if (spec.paletteKey === "chat") chatDock = btn;
      if (spec.paletteKey === "ready") readyDock = btn;
    });

    const snd = new CartoonCircleButton({
      kind: "sound",
      radius: DOCK_R,
      colors: DOCK_PALETTE.sound,
      phaseOffset: 8,
      onPress: d.sound,
    });
    const mus = new CartoonCircleButton({
      kind: "music",
      radius: DOCK_R,
      colors: DOCK_PALETTE.music,
      phaseOffset: 9,
      onPress: d.music,
    });
    soundDock = snd;
    musicDock = mus;
    dockCircles.push(snd, mus);
    dockContainer.addChild(snd, mus);
    snd.setDimmed(options.initialSoundMuted ?? false);
    mus.setDimmed(options.initialMusicMuted ?? false);
  }

  const panel = new Container();
  uiRoot.addChild(panel);

  const panelTitle = new BitmapText({
    text: "PLAYERS",
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 9,
      fill: 0xfef3c7,
      align: "left",
    },
  });
  panelTitle.roundPixels = true;
  panel.addChild(panelTitle);

  const slots: PlayerSlot[] = [];
  for (let i = 0; i < 3; i++) {
    const slot = new PlayerSlot({
      slotWidth: SLOT_W,
      accentColor: PLAYER_COLORS[i] ?? 0xffffff,
    });
    slot.y = 22 + i * 42;
    panel.addChild(slot);
    slots.push(slot);
  }

  let displayName = options.initialDisplayName;
  let guestNames = [...(options.guestSeed ?? [])];

  function applySlots(): void {
    const raw = [displayName, ...guestNames].slice(0, 3);
    const labels = assignUniqueDisplayNames(raw);
    for (let i = 0; i < 3; i++) {
      const slot = slots[i];
      const lab = labels[i];
      const col = PLAYER_COLORS[i] ?? 0xffffff;
      if (lab !== undefined && lab !== "") {
        slot.setOccupied(lab, col);
      } else {
        slot.setEmpty();
      }
    }
  }

  applySlots();

  btnYourName.setLabel(`NAME: ${displayName.toUpperCase()}`.slice(0, 22));

  function layoutUi(): void {
    const rw = app.screen.width / pixelScale;
    const rh = app.screen.height / pixelScale;

    baseBg.clear();
    baseBg.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x06060f });

    tiling.width = app.screen.width;
    tiling.height = app.screen.height;

    title.position.set(rw / 2, 18);

    const gap = 12;
    const cx = 48 + BUTTON_W / 2;
    const cy0 = 72 + BUTTON_H / 2;
    btnYourName.position.set(cx, cy0);
    btnBot.position.set(cx, cy0 + BUTTON_H + gap);
    btnOnline.position.set(cx, cy0 + 2 * (BUTTON_H + gap));
    btnLobby.position.set(cx, cy0 + 3 * (BUTTON_H + gap));

    menuCol.position.set(0, 0);

    const panelX = rw - SLOT_W - 56;
    panel.position.set(panelX, 88);
    panelTitle.position.set(0, -2);

    if (dockCircles.length >= 8) {
      const y1 = rh - 58;
      const startX = rw / 2 - (DOCK_GAP * 7) / 2;
      for (let i = 0; i < 8; i++) {
        dockCircles[i]?.position.set(startX + i * DOCK_GAP, y1);
      }
      const y2 = rh - 22;
      dockCircles[8]?.position.set(rw / 2 - 22, y2);
      dockCircles[9]?.position.set(rw / 2 + 22, y2);
    }

    layoutCreateLobbyOverlay();
  }

  layoutUi();

  const onResize = (): void => {
    layoutUi();
  };
  app.renderer.on("resize", onResize);

  let t = 0;
  const onTick = (): void => {
    t += app.ticker.deltaMS * 0.002;
    title.y = 18 + Math.sin(t * 1.6) * 2;
    title.alpha = 0.92 + Math.sin(t * 2.1) * 0.06;

    tiling.tilePosition.x += 0.12 * app.ticker.deltaTime;
    tiling.tilePosition.y += 0.07 * app.ticker.deltaTime;

    for (const c of dockCircles) {
      c.step(t);
    }
  };
  app.ticker.add(onTick);

  const destroy = (): void => {
    floatingPixels.destroy();
    app.ticker.remove(onTick);
    app.renderer.off("resize", onResize);
    tileTex.destroy(true);
    root.destroy({ children: true });
  };

  return {
    root,
    openCreateLobbyOverlay: openCreateLobby,
    setDisplayName: (name: string) => {
      displayName = name;
      const short = name.trim() || "PLAYER";
      btnYourName.setLabel(
        `NAME: ${short.toUpperCase()}`.length > 24
          ? `NAME: ${short.toUpperCase().slice(0, 20)}…`
          : `NAME: ${short.toUpperCase()}`,
      );
      applySlots();
    },
    setGuestNames: (names: readonly string[]) => {
      guestNames = [...names];
      applySlots();
    },
    setChatBadge: (n: number) => {
      chatDock?.setBadgeCount(n);
    },
    setReadyHighlighted: (on: boolean) => {
      readyDock?.setReadyHighlighted(on);
    },
    setSoundMuted: (muted: boolean) => {
      soundDock?.setDimmed(muted);
    },
    setMusicMuted: (muted: boolean) => {
      musicDock?.setDimmed(muted);
    },
    setLobbyCreatePending: (pending: boolean) => {
      lobbyCreatePending = pending;
      applyLobbyCreatePending();
    },
    destroy,
  };
}
