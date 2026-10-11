import { Container } from 'pixi.js';

/**
 * A scene owns the world layers that the camera is allowed to move.
 * UI stays outside this container.
 */
export abstract class Scene {
  readonly backgroundLayer = new Container();
  readonly middleLayer = new Container();
  readonly characterLayer = new Container();
  readonly foregroundLayer = new Container();

  constructor(protected readonly world: Container) {
    this.backgroundLayer.label = 'background';
    this.middleLayer.label = 'middle';
    this.characterLayer.label = 'character';
    this.foregroundLayer.label = 'foreground';

    this.world.addChild(
      this.backgroundLayer,
      this.middleLayer,
      this.characterLayer,
      this.foregroundLayer,
    );
  }

  abstract init(width: number, height: number): Promise<void>;

  update(_deltaMS: number): void {}

  resize(_width: number, _height: number): void {}

  onPointerMove(_x: number, _y: number): void {}

  onPointerDown(): void {}

  onKeyDown(_code: string): void {}

  destroy(): void {
    this.backgroundLayer.destroy({ children: true });
    this.middleLayer.destroy({ children: true });
    this.characterLayer.destroy({ children: true });
    this.foregroundLayer.destroy({ children: true });
  }
}
