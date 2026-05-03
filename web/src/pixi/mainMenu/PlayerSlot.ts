import { BitmapText, Container, Graphics } from "pixi.js";
import { LOBBY_FONT_NAME } from "./installLobbyBitmapFont";

export interface PlayerSlotOptions {
  slotWidth: number;
  /** Fill when occupied */
  accentColor: number;
  fontSize?: number;
}

/**
 * Avatar chip + label + colored rim for lobby roster preview (up to three slots).
 */
export class PlayerSlot extends Container {
  private readonly _rim: Graphics;
  private readonly _avatar: Graphics;
  private readonly _name: BitmapText;
  private readonly _opts: PlayerSlotOptions;

  constructor(opts: PlayerSlotOptions) {
    super();
    this._opts = opts;
    const h = 36;
    const avR = 13;

    this._rim = new Graphics();
    this._rim.roundRect(0, 0, opts.slotWidth, h, 8).stroke({
      width: 3,
      color: opts.accentColor,
      alpha: 0.95,
    });
    this.addChild(this._rim);

    this._avatar = new Graphics();
    this._avatar.x = 18;
    this._avatar.y = h / 2;
    this.addChild(this._avatar);

    this._name = new BitmapText({
      text: "—",
      style: {
        fontFamily: LOBBY_FONT_NAME,
        fontSize: opts.fontSize ?? 8,
        fill: 0xe2e8f0,
        align: "left",
      },
    });
    this._name.roundPixels = true;
    this._name.position.set(38, 10);
    this.addChild(this._name);

    this.setEmpty();
  }

  setOccupied(displayName: string, accent: number): void {
    const avR = 13;
    this._avatar.clear();
    this._avatar
      .circle(0, 0, avR)
      .fill({ color: accent })
      .stroke({ width: 2, color: 0x0f172a, alpha: 0.9 });

    this._rim.clear();
    this._rim.roundRect(0, 0, this._opts.slotWidth, 36, 8).stroke({
      width: 3,
      color: accent,
      alpha: 0.95,
    });

    this._name.text = displayName.toUpperCase();
  }

  setEmpty(): void {
    const c = 0x475569;
    this._avatar.clear();
    this._avatar
      .roundRect(-10, -10, 20, 20, 4)
      .fill({ color: 0x334155 })
      .stroke({ width: 1, color: c });

    this._rim.clear();
    this._rim.roundRect(0, 0, this._opts.slotWidth, 36, 8).stroke({
      width: 2,
      color: c,
      alpha: 0.75,
    });

    this._name.text = "WAITING...";
  }
}
