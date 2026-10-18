import { Graphics } from 'pixi.js';
import type { StageScene } from '../scenes/StageScene';

const FADE_OUT_MS = 160;
const FADE_IN_MS = 280;
/** How far the stills travel, as a fraction of the square. */
const SLIDE_RATIO = 0.34;

/**
 * Teleforum look: a short fade to black, then the new still slides in
 * from the side of the arrow that was clicked.
 */
export class LookTransition {
  readonly root = new Graphics({ label: 'look-fade' });

  private side = 1;
  private phase: 'off' | 'out' | 'hold' | 'in' = 'off';
  private elapsed = 0;
  /** +1 looks right, -1 looks left. */
  private direction = 1;
  private scene: StageScene | null = null;
  private swap: (() => Promise<void>) | null = null;
  private finish: (() => void) | null = null;

  constructor() {
    this.root.eventMode = 'none';
    this.root.visible = false;
    this.root.alpha = 0;
  }

  get busy(): boolean {
    return this.phase !== 'off';
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    this.root.clear().rect(0, 0, this.side, this.side).fill(0x000000);
  }

  play(direction: 1 | -1, scene: StageScene, swap: () => Promise<void>): Promise<void> {
    if (this.busy) {
      return Promise.resolve();
    }
    this.direction = direction;
    this.scene = scene;
    this.swap = swap;
    this.phase = 'out';
    this.elapsed = 0;
    this.root.visible = true;
    this.root.alpha = 0;
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  /** Drops a look in progress, used when leaving the level. */
  cancel(): void {
    this.scene?.setLookSlide(0);
    this.scene = null;
    this.swap = null;
    this.phase = 'off';
    this.elapsed = 0;
    this.root.alpha = 0;
    this.root.visible = false;
    const finish = this.finish;
    this.finish = null;
    finish?.();
  }

  update(deltaMS: number): void {
    if (this.phase === 'off' || this.phase === 'hold') {
      return;
    }
    this.elapsed += deltaMS;
    if (this.phase === 'out') {
      const t = Math.min(1, this.elapsed / FADE_OUT_MS);
      this.root.alpha = t;
      this.scene?.setLookSlide(-this.direction * this.slidePx * easeIn(t));
      if (t >= 1) {
        this.beginSwap();
      }
      return;
    }
    const t = Math.min(1, this.elapsed / FADE_IN_MS);
    const eased = easeOut(t);
    this.root.alpha = 1 - t;
    this.scene?.setLookSlide(this.direction * this.slidePx * (1 - eased));
    if (t >= 1) {
      this.scene?.setLookSlide(0);
      this.scene = null;
      this.phase = 'off';
      this.root.alpha = 0;
      this.root.visible = false;
      const finish = this.finish;
      this.finish = null;
      finish?.();
    }
  }

  private get slidePx(): number {
    return this.side * SLIDE_RATIO;
  }

  private beginSwap(): void {
    const swap = this.swap;
    const scene = this.scene;
    this.swap = null;
    this.phase = 'hold';
    this.elapsed = 0;
    void (async () => {
      await swap?.();
      if (this.phase !== 'hold' || !scene || this.scene !== scene) {
        return;
      }
      scene.setLookSlide(this.direction * this.slidePx);
      this.phase = 'in';
      this.elapsed = 0;
    })();
  }
}

function easeIn(t: number): number {
  return t * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
