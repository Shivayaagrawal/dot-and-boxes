import { BitmapFont } from "pixi.js";
import { uninstallBitmapFontIfInstalled } from "@/pixi/uninstallBitmapFontIfInstalled";

export const LOBBY_FONT_NAME = "DnBoxesLobbyPixel";

const FONT_CHARS: (string | [string, string])[] = [
  ["a", "z"],
  ["A", "Z"],
  ["0", "9"],
  " .,!:;-_%&()?x",
];

export function installLobbyBitmapFont(): boolean {
  uninstallBitmapFontIfInstalled(LOBBY_FONT_NAME);

  try {
    BitmapFont.install({
      name: LOBBY_FONT_NAME,
      style: {
        fontFamily: '"Press Start 2P", Courier New, Courier, monospace',
        fontSize: 10,
        fontWeight: "600",
        fill: "#f8fafc",
      },
      chars: FONT_CHARS,
      resolution: 1,
      textureStyle: {
        scaleMode: "nearest",
      },
    });
    return true;
  } catch {
    try {
      BitmapFont.install({
        name: LOBBY_FONT_NAME,
        style: {
          fontFamily: "Courier New, Courier, monospace",
          fontSize: 11,
          fontWeight: "700",
          fill: "#f8fafc",
        },
        chars: FONT_CHARS,
        resolution: 1,
        textureStyle: { scaleMode: "nearest" },
      });
      return true;
    } catch {
      return false;
    }
  }
}

export function uninstallLobbyBitmapFont(): void {
  uninstallBitmapFontIfInstalled(LOBBY_FONT_NAME);
}
