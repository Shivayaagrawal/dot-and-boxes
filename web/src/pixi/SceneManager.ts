import type { Container } from "pixi.js";

export interface ManagedScene {
  root: Container;
  destroy: () => void;
}

/**
 * Owns the active Pixi scene under a single mount — swap destroys the previous scene.
 */
export class SceneManager {
  private current: ManagedScene | null = null;

  constructor(private readonly mount: Container) {}

  get active(): ManagedScene | null {
    return this.current;
  }

  switch(next: ManagedScene): void {
    this.current?.destroy();
    this.mount.removeChildren();
    this.mount.addChild(next.root);
    this.current = next;
  }

  destroy(): void {
    this.current?.destroy();
    this.current = null;
    this.mount.removeChildren();
  }
}
