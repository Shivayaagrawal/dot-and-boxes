import { Application, Container, Graphics } from "pixi.js";

const DEFAULT_COUNT = 40;

/**
 * Slow-drifting 1–2px squares for ambient motion. Not used on the loading screen.
 */
export class FloatingPixels {
  readonly container = new Container();
  private readonly app: Application;
  private readonly particles: Graphics[] = [];
  private readonly update = (): void => {
    const h = this.app.screen.height;
    const w = this.app.screen.width;
    const dt = this.app.ticker.deltaTime;
    for (const p of this.particles) {
      p.y -= 0.18 * dt;
      if (p.y < -6) {
        p.y = h + 4 + Math.random() * 24;
        p.x = Math.random() * w;
      }
    }
  };

  constructor(app: Application, count = DEFAULT_COUNT) {
    this.app = app;
    this.container.eventMode = "none";
    this.container.label = "floatingPixels";

    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      p.rect(0, 0, 2, 2).fill({
        color: 0xffffff,
        alpha: 0.28 + Math.random() * 0.42,
      });
      p.roundPixels = true;
      p.x = Math.random() * Math.max(1, app.screen.width);
      p.y = Math.random() * Math.max(1, app.screen.height);
      this.particles.push(p);
      this.container.addChild(p);
    }

    app.ticker.add(this.update);
  }

  destroy(): void {
    this.app.ticker.remove(this.update);
    this.container.destroy({ children: true });
  }
}
