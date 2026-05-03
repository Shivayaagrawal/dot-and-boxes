import {
  BitmapText,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
} from "pixi.js";
import { LOBBY_FONT_NAME } from "./installLobbyBitmapFont";

export interface PixelButtonStyle {
  /** Fill for the face */
  face: number;
  /** Top / left highlight stroke */
  highlight: number;
  /** Bottom / right shadow */
  shadow: number;
  /** Outer border */
  border: number;
}

const DEFAULT_STYLE: PixelButtonStyle = {
  face: 0x6b4c3b,
  highlight: 0xd2b48c,
  shadow: 0x2d1f18,
  border: 0x1a120e,
};

export interface PixelButtonOptions {
  label: string;
  width: number;
  height: number;
  fontSize?: number;
  /** Text fill (bitmap glyph color before tint) */
  textFill?: number;
  style?: Partial<PixelButtonStyle>;
  onPress?: () => void;
}

/**
 * Chunky pixel-art style button (vector bevel, no external assets).
 * Pointer origin is center; position with `x,y` as the button center.
 */
export class PixelButton extends Container {
  readonly buttonWidth: number;
  readonly buttonHeight: number;
  private readonly _face: Graphics;
  private readonly _label: BitmapText;
  private _baseScale = 1;
  private _hover = false;
  private _pointerDown = false;
  private readonly _style: PixelButtonStyle;

  constructor(opts: PixelButtonOptions) {
    super();

    this.buttonWidth = opts.width;
    this.buttonHeight = opts.height;
    this._style = { ...DEFAULT_STYLE, ...opts.style };
    this.eventMode = "static";
    this.cursor = "pointer";

    this._face = new Graphics();
    this.redrawFace(false);
    this.addChild(this._face);

    this._label = new BitmapText({
      text: opts.label,
      style: {
        fontFamily: LOBBY_FONT_NAME,
        fontSize: opts.fontSize ?? 9,
        fill: opts.textFill ?? 0xf5e6c8,
        align: "center",
      },
    });
    this._label.roundPixels = true;
    this._label.anchor.set(0.5);
    this._label.position.set(opts.width / 2, opts.height / 2 - 1);
    this.addChild(this._label);

    this.hitArea = new Rectangle(0, 0, opts.width, opts.height);
    this.pivot.set(opts.width / 2, opts.height / 2);

    const onDown = (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this._pointerDown = true;
      this.applyVisualScale();
      const up = () => {
        this._pointerDown = false;
        this.applyVisualScale();
      };
      globalThis.addEventListener("pointerup", up, { once: true });
    };

    this.on("pointertap", () => {
      opts.onPress?.();
    });
    this.on("pointerdown", onDown);
    this.on("pointerover", () => {
      this._hover = true;
      this.applyVisualScale();
    });
    this.on("pointerout", () => {
      this._hover = false;
      this._pointerDown = false;
      this.applyVisualScale();
    });
  }

  setLabel(text: string): void {
    this._label.text = text;
  }

  setBaseScale(s: number): void {
    this._baseScale = s;
    this.applyVisualScale();
  }

  private applyVisualScale(): void {
    let m = this._baseScale;
    if (this._pointerDown) m *= 0.95;
    else if (this._hover) m *= 1.05;
    this.scale.set(m);
    this.redrawFace(this._pointerDown);
  }

  private redrawFace(pressed: boolean): void {
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const pad = 2;
    const r = 6;
    const shadowDrop = pressed ? 1 : 4;
    const st = this._style;

    this._face.clear();
    this._face
      .roundRect(0, 0, w, h, r)
      .fill({ color: st.face })
      .stroke({ width: 2, color: st.border });

    // Top highlight
    this._face
      .moveTo(pad + 2, pad + 2)
      .lineTo(w - pad - 2, pad + 2)
      .stroke({ width: 2, color: st.highlight, alpha: 0.95 });

    // Bottom shadow (thinner when pressed)
    this._face
      .moveTo(pad + 2, h - pad - shadowDrop)
      .lineTo(w - pad - 2, h - pad - shadowDrop)
      .stroke({
        width: pressed ? 2 : 3,
        color: st.shadow,
        alpha: 0.92,
      });
  }
}
