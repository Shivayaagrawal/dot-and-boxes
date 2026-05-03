import {
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
} from "pixi.js";

export type CartoonIconKind =
  | "play"
  | "home"
  | "chat"
  | "trophy"
  | "gear"
  | "refresh"
  | "check"
  | "list"
  | "sound"
  | "music";

export interface CartoonCircleColors {
  face: number;
  rim: number;
  icon: number;
  glint: number;
}

const DEFAULT_GLINT = 0xffffff;

export interface CartoonCircleButtonOptions {
  radius?: number;
  kind: CartoonIconKind;
  colors: CartoonCircleColors;
  /** Phase offset for idle breathing so buttons don't sync */
  phaseOffset?: number;
  onPress?: () => void;
}

/**
 * Glossy circular dock button (vector candy style — multicolor via `colors`).
 * Idle “breathing”, hover lift + brighten, press squish. Call `step(globalT)` from scene ticker.
 */
export class CartoonCircleButton extends Container {
  readonly radius: number;
  private readonly _colors: CartoonCircleColors;
  private readonly _body: Graphics;
  private readonly _iconG: Graphics;
  private readonly _glint: Graphics;
  private readonly _badge: Graphics;
  private readonly _badgePhase: Graphics;
  private readonly _pulse: Container;
  private _phaseOff: number;
  private _hover = false;
  private _pressed = false;
  private _badgeCount = 0;
  private _readyLit = false;

  constructor(opts: CartoonCircleButtonOptions) {
    super();
    this.radius = opts.radius ?? 22;
    this._colors = opts.colors;
    this._phaseOff = opts.phaseOffset ?? 0;

    this.eventMode = "static";
    this.cursor = "pointer";
    const d = this.radius * 2;
    this.hitArea = new Rectangle(0, 0, d, d);
    this.pivot.set(this.radius, this.radius);

    this._pulse = new Container();
    this._pulse.position.set(this.radius, this.radius);
    this.addChild(this._pulse);

    this._body = new Graphics();
    this._iconG = new Graphics();
    this._glint = new Graphics();
    this._badge = new Graphics();
    this._badge.visible = false;
    this._badgePhase = new Graphics();

    this._pulse.addChild(this._body, this._iconG, this._glint, this._badgePhase);

    this._badge.position.set(this.radius * 2 - 6, 6);
    this.addChild(this._badge);

    this.redrawBody();
    this.drawIcon(opts.kind);
    this.redrawGlint();

    const onDown = (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this._pressed = true;
      const up = () => {
        this._pressed = false;
      };
      globalThis.addEventListener("pointerup", up, { once: true });
    };

    this.on("pointertap", () => opts.onPress?.());
    this.on("pointerdown", onDown);
    this.on("pointerover", () => {
      this._hover = true;
    });
    this.on("pointerout", () => {
      this._hover = false;
      this._pressed = false;
    });
  }

  setBadgeCount(n: number): void {
    this._badgeCount = Math.max(0, Math.floor(n));
    this.redrawBadge();
  }

  /** Ready checkmark: extra rim pulse when player is ready in lobby */
  setReadyHighlighted(on: boolean): void {
    this._readyLit = on;
  }

  /** Muted SFX / BGM: dim the glyph */
  setDimmed(on: boolean): void {
    this._iconG.alpha = on ? 0.38 : 1;
  }

  step(globalT: number): void {
    const breath = 1 + Math.sin(globalT * 1.15 + this._phaseOff) * 0.038;
    let s = breath;
    if (this._pressed) s *= 0.88;
    else if (this._hover) s *= 1.06;

    this._pulse.scale.set(s);
    this._pulse.y = this._pressed ? 2 : this._hover ? -3 : 0;

    const glintA =
      0.55 +
      Math.sin(globalT * 2.4 + this._phaseOff) * 0.12 +
      (this._hover ? 0.15 : 0);
    this._glint.alpha = Math.min(0.95, glintA);

    if (this._readyLit) {
      this._badgePhase.clear();
      const pulse = 0.65 + Math.sin(globalT * 4) * 0.35;
      this._badgePhase
        .circle(0, 0, this.radius + 4 + pulse * 2)
        .stroke({ width: 2, color: 0x06ffa5, alpha: 0.35 + pulse * 0.25 });
    } else {
      this._badgePhase.clear();
    }
  }

  private redrawBody(): void {
    const r = this.radius;
    const { face, rim } = this._colors;
    this._body.clear();
    // Outer rim (thick cartoon edge)
    this._body.circle(r, r, r).fill({ color: rim });
    // Face (slightly inset)
    const inset = 4;
    this._body
      .circle(r, r, r - inset)
      .fill({ color: face })
      .stroke({ width: 2, color: rim, alpha: 0.85 });
    // Bottom shading wedge
    this._body
      .arc(r, r + 2, r - inset - 1, 0.15 * Math.PI, 0.85 * Math.PI)
      .stroke({ width: 8, color: 0x000000, alpha: 0.12 });
  }

  private redrawGlint(): void {
    const r = this.radius;
    const glint = this._colors.glint ?? DEFAULT_GLINT;
    this._glint.clear();
    this._glint
      .ellipse(r - r * 0.35, r - r * 0.38, r * 0.35, r * 0.22)
      .fill({ color: glint, alpha: 0.75 });
    this._glint
      .ellipse(r - r * 0.42, r - r * 0.42, r * 0.12, r * 0.08)
      .fill({ color: glint, alpha: 0.95 });
  }

  private redrawBadge(): void {
    this._badge.clear();
    if (this._badgeCount <= 0) {
      this._badge.visible = false;
      return;
    }
    this._badge.visible = true;
    const label =
      this._badgeCount > 9 ? "9+" : String(this._badgeCount);
    const w = label.length > 1 ? 18 : 14;
    this._badge.roundRect(-w / 2, -8, w, 16, 8).fill({ color: 0xdc2626 });
    this._badge.roundRect(-w / 2, -8, w, 16, 8).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
  }

  private drawIcon(kind: CartoonIconKind): void {
    const r = this.radius;
    const ic = this._colors.icon;
    const cx = r;
    const cy = r;
    const g = this._iconG;
    g.clear();

    const stroke = { width: 2.5, color: ic, cap: "round" as const };

    switch (kind) {
      case "play": {
        const s = r * 0.55;
        g.moveTo(cx - s * 0.35, cy - s)
          .lineTo(cx - s * 0.35, cy + s)
          .lineTo(cx + s * 0.65, cy)
          .closePath()
          .fill({ color: ic });
        break;
      }
      case "home": {
        const w = r * 0.55;
        const roof = cy - r * 0.15;
        g.moveTo(cx, cy - r * 0.65)
          .lineTo(cx + w, roof)
          .lineTo(cx + w * 0.65, roof)
          .lineTo(cx + w * 0.65, cy + r * 0.45)
          .lineTo(cx - w * 0.65, cy + r * 0.45)
          .lineTo(cx - w * 0.65, roof)
          .lineTo(cx - w, roof)
          .closePath()
          .fill({ color: ic });
        break;
      }
      case "chat": {
        const w = r * 0.7;
        const h = r * 0.45;
        const top = cy - h * 0.35;
        g.roundRect(cx - w / 2, top, w, h, 3).stroke(stroke);
        g.moveTo(cx - w * 0.25, top + h)
          .lineTo(cx - w * 0.35, cy + r * 0.55)
          .lineTo(cx + w * 0.15, top + h)
          .stroke(stroke);
        break;
      }
      case "trophy": {
        const bw = r * 0.5;
        g.roundRect(cx - bw / 2, cy - r * 0.25, bw, r * 0.45, 2).stroke(stroke);
        g.moveTo(cx - bw * 0.35, cy - r * 0.25).lineTo(cx - bw * 0.5, cy - r * 0.55).lineTo(cx + bw * 0.5, cy - r * 0.55).lineTo(cx + bw * 0.35, cy - r * 0.25).stroke(stroke);
        g.moveTo(cx, cy + r * 0.2).lineTo(cx, cy + r * 0.45).stroke(stroke);
        g.moveTo(cx - bw * 0.35, cy + r * 0.45).lineTo(cx + bw * 0.35, cy + r * 0.45).stroke(stroke);
        break;
      }
      case "gear": {
        const R = r * 0.28;
        g.circle(cx, cy, R).stroke(stroke);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const x1 = cx + Math.cos(a) * R * 1.1;
          const y1 = cy + Math.sin(a) * R * 1.1;
          const x2 = cx + Math.cos(a) * R * 1.65;
          const y2 = cy + Math.sin(a) * R * 1.65;
          g.moveTo(x1, y1).lineTo(x2, y2).stroke(stroke);
        }
        break;
      }
      case "refresh": {
        const R = r * 0.42;
        g.arc(cx, cy, R, -Math.PI * 0.2, Math.PI * 1.15).stroke(stroke);
        const a = Math.PI * 1.15;
        const ax = cx + Math.cos(a) * R;
        const ay = cy + Math.sin(a) * R;
        g.moveTo(ax, ay)
          .lineTo(ax - 6, ay - 2)
          .lineTo(ax - 1, ay + 5)
          .closePath()
          .fill({ color: ic });
        break;
      }
      case "check": {
        const s = r * 0.45;
        g.moveTo(cx - s * 0.7, cy)
          .lineTo(cx - s * 0.15, cy + s * 0.65)
          .lineTo(cx + s * 0.85, cy - s * 0.55)
          .stroke({ ...stroke, width: 3.5 });
        break;
      }
      case "list": {
        for (let i = -1; i <= 1; i++) {
          const y = cy + i * r * 0.22;
          g.moveTo(cx - r * 0.45, y).lineTo(cx + r * 0.45, y).stroke(stroke);
        }
        break;
      }
      case "sound": {
        g.moveTo(cx - r * 0.45, cy - r * 0.35)
          .lineTo(cx - r * 0.45, cy + r * 0.35)
          .lineTo(cx - r * 0.15, cy + r * 0.25)
          .lineTo(cx - r * 0.15, cy - r * 0.25)
          .closePath()
          .fill({ color: ic });
        g.arc(cx + r * 0.05, cy, r * 0.35, -0.45 * Math.PI, 0.45 * Math.PI).stroke(stroke);
        break;
      }
      case "music": {
        const w = r * 0.35;
        g.roundRect(cx - w / 2, cy - r * 0.45, w, r * 0.55, 2).stroke(stroke);
        g.moveTo(cx - w * 0.35, cy + r * 0.1).lineTo(cx - w * 0.55, cy + r * 0.55).stroke(stroke);
        g.moveTo(cx + w * 0.35, cy + r * 0.1).lineTo(cx + w * 0.55, cy + r * 0.55).stroke(stroke);
        break;
      }
      default:
        break;
    }
  }
}
