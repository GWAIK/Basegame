import { Container } from 'pixi.js';

/**
 * A scene builds its content in its own root container.
 * Game adds the root to the camera world only once load() has finished,
 * so switching scenes never shows a half-loaded frame.
 */
export abstract class Scene {
  readonly root = new Container();
  readonly backgroundLayer = new Container();
  readonly middleLayer = new Container();
  readonly characterLayer = new Container();
  readonly foregroundLayer = new Container();

  protected viewWidth = 1;
  protected viewHeight = 1;
  protected destroyed = false;

  constructor() {
    this.backgroundLayer.label = 'background';
    this.middleLayer.label = 'middle';
    this.characterLayer.label = 'character';
    this.foregroundLayer.label = 'foreground';
    this.root.addChild(
      this.backgroundLayer,
      this.middleLayer,
      this.characterLayer,
      this.foregroundLayer,
    );
  }

  abstract load(): Promise<void>;

  update(_deltaMS: number): void {}

  resize(width: number, height: number): void {
    this.viewWidth = Math.max(width, 1);
    this.viewHeight = Math.max(height, 1);
  }

  /** Screen coordinates. Not called while a dialogue is open. */
  onPointerDown(_x: number, _y: number): void {}

  /**
   * Screen coordinates. Not called while a dialogue is open.
   * Return a CSS cursor when the pointer is over something, or null.
   */
  onPointerMove(_x: number, _y: number): string | null {
    return null;
  }

  /** Screen coordinates. Not called while a dialogue is open. */
  onPointerUp(_x: number, _y: number): void {}

  /** True while a scene is dragging something and the camera should hold still. */
  isCapturingPointer(): boolean {
    return false;
  }

  /** Not called while a dialogue is open. */
  onKeyDown(_code: string): void {}

  destroy(): void {
    this.destroyed = true;
    this.root.destroy({ children: true });
  }
}
