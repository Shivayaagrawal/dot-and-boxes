import {
  Application,
  BitmapText,
  Container,
  Graphics,
  TextureStyle,
  TilingSprite,
} from "pixi.js";
import { createFloatingPixelLayer } from "@/pixi/background/BackgroundLayer";
import { LOBBY_FONT_NAME } from "@/pixi/mainMenu/installLobbyBitmapFont";
import type { ManagedScene } from "@/pixi/SceneManager";

TextureStyle.defaultOptions.scaleMode = "nearest";

function stripTexture(app: Application): import("pixi.js").Texture {
  const g = new Graphics();
  const s = 32;
  g.rect(0, 0, s, s).fill({ color: 0x111827 });
  g.rect(0, 0, s, 2).fill({ color: 0xfbbf24, alpha: 0.12 });
  const tex = app.renderer.generateTexture({
    target: g,
    resolution: 1,
    textureSourceOptions: { scaleMode: "nearest" },
  });
  g.destroy();
  return tex;
}

export interface LobbySceneOptions {
  lobbyName: string;
  hint?: string;
}

/**
 * Placeholder full-screen lobby chrome — wire from routing when the lobby route is folded into `/play`.
 * Matches main-menu palette so transitions stay cohesive.
 */
export function createLobbyScene(
  app: Application,
  options: LobbySceneOptions,
): ManagedScene {
  const root = new Container();

  const bg = new Graphics();
  root.addChild(bg);

  const tileTex = stripTexture(app);
  const tiling = new TilingSprite({
    texture: tileTex,
    width: app.screen.width,
    height: app.screen.height,
  });
  tiling.alpha = 0.4;
  tiling.eventMode = "none";
  root.addChild(tiling);

  const floatingPixels = createFloatingPixelLayer(app);
  root.addChild(floatingPixels.container);

  const title = new BitmapText({
    text: "LOBBY",
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 14,
      fill: 0xfef3c7,
      align: "center",
    },
  });
  title.roundPixels = true;
  title.anchor.set(0.5, 0);
  root.addChild(title);

  const nameLine = new BitmapText({
    text: options.lobbyName.toUpperCase().slice(0, 36),
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 9,
      fill: 0xa8dadc,
      align: "center",
    },
  });
  nameLine.roundPixels = true;
  nameLine.anchor.set(0.5, 0);
  root.addChild(nameLine);

  const hint = new BitmapText({
    text: (options.hint ?? "WAITING FOR HOST…").toUpperCase(),
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 7,
      fill: 0x64748b,
      align: "center",
    },
  });
  hint.roundPixels = true;
  hint.anchor.set(0.5, 0);
  root.addChild(hint);

  let t = 0;
  let titleAnchorY = 0;

  const layout = (): void => {
    bg.clear();
    bg.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x06060f });
    tiling.width = app.screen.width;
    tiling.height = app.screen.height;
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    titleAnchorY = cy - 48;
    title.position.set(cx, titleAnchorY);
    nameLine.position.set(cx, cy - 12);
    hint.position.set(cx, cy + 16);
  };

  const onTick = (): void => {
    t += app.ticker.deltaMS * 0.002;
    tiling.tilePosition.x += 0.14 * app.ticker.deltaTime;
    title.position.y = titleAnchorY + Math.sin(t * 1.4) * 2;
    title.alpha = 0.9 + Math.sin(t * 2) * 0.06;
  };

  app.renderer.on("resize", layout);
  app.ticker.add(onTick);
  layout();

  const destroy = (): void => {
    floatingPixels.destroy();
    app.ticker.remove(onTick);
    app.renderer.off("resize", layout);
    tileTex.destroy(true);
    root.destroy({ children: true });
  };

  return { root, destroy };
}
