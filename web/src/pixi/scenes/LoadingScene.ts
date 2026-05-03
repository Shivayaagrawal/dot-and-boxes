import {
  Application,
  BitmapText,
  Container,
  Graphics,
  TextureStyle,
  TilingSprite,
} from "pixi.js";
import { LOBBY_FONT_NAME } from "@/pixi/mainMenu/installLobbyBitmapFont";
import type { ManagedScene } from "@/pixi/SceneManager";

TextureStyle.defaultOptions.scaleMode = "nearest";

/** Canvas clear + base fill — matches React Suspense wrapper for Pixi (`PixiLoaderPersistent`). */
export const LOADING_SCENE_BACKGROUND_COLOR = 0x8eb8d8 as const;

function makeLightBluePixelTile(app: Application): import("pixi.js").Texture {
  const tile = new Graphics();
  const cell = 4;
  const grid = 8;
  const shades = [0xa8d4f0, 0x7aa8c8, 0x94c4e4];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const idx = (gx + gy + Math.floor(gx / 2)) % 3;
      tile
        .rect(gx * cell, gy * cell, cell, cell)
        .fill({ color: shades[idx] });
    }
  }
  const tex = app.renderer.generateTexture({
    target: tile,
    resolution: 1,
    textureSourceOptions: { scaleMode: "nearest" },
  });
  tile.destroy();
  return tex;
}

/** Shown immediately after boot until main menu assets & layout are mounted */
export function createLoadingScene(app: Application): ManagedScene {
  const root = new Container();

  const baseBg = new Graphics();
  baseBg
    .rect(0, 0, app.screen.width, app.screen.height)
    .fill({ color: LOADING_SCENE_BACKGROUND_COLOR });
  root.addChild(baseBg);

  const tileTex = makeLightBluePixelTile(app);
  const tiling = new TilingSprite({
    texture: tileTex,
    width: app.screen.width,
    height: app.screen.height,
  });
  tiling.alpha = 0.55;
  tiling.eventMode = "none";
  root.addChild(tiling);

  const label = new BitmapText({
    text: "LOADING…",
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 16,
      fill: 0x0f2942,
      align: "center",
    },
  });
  label.roundPixels = true;
  label.anchor.set(0.5);
  root.addChild(label);

  const sub = new BitmapText({
    text: "GETTING THINGS READY",
    style: {
      fontFamily: LOBBY_FONT_NAME,
      fontSize: 8,
      fill: 0x3d5a73,
      align: "center",
    },
  });
  sub.roundPixels = true;
  sub.anchor.set(0.5);
  root.addChild(sub);

  const onResize = (): void => {
    baseBg.clear();
    baseBg
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: LOADING_SCENE_BACKGROUND_COLOR });
    tiling.width = app.screen.width;
    tiling.height = app.screen.height;
    label.position.set(app.screen.width / 2, app.screen.height / 2 - 16);
    sub.position.set(app.screen.width / 2, app.screen.height / 2 + 14);
  };

  app.renderer.on("resize", onResize);
  onResize();

  const destroy = (): void => {
    app.renderer.off("resize", onResize);
    tileTex.destroy(true);
    root.destroy({ children: true });
  };

  return { root, destroy };
}
