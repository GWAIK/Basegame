import { Application, Container } from 'pixi.js';
import { MainScene } from '../scenes/MainScene';

export class Game {
  private scene: MainScene | null = null;

  async start(host: HTMLElement): Promise<void> {
    const app = new Application();

    await app.init({
      resizeTo: window,
      background: 0x0b0c10,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    app.canvas.style.display = 'block';
    host.appendChild(app.canvas);

    const world = new Container();
    const ui = new Container();
    world.label = 'world';
    ui.label = 'ui';
    app.stage.addChild(world, ui);

    const scene = new MainScene(world, ui);
    this.scene = scene;
    await scene.init(app.screen.width, app.screen.height);

    app.ticker.add((ticker) => {
      scene.update(ticker.deltaMS);
    });

    app.renderer.on('resize', () => {
      scene.resize(app.screen.width, app.screen.height);
    });

    this.bindInput(app.canvas, scene);
  }

  startDialogue(): void {
    this.scene?.startDialogue();
  }

  shakeCamera(): void {
    this.scene?.shakeCamera();
  }

  resetCamera(): void {
    this.scene?.resetCamera();
  }

  private bindInput(canvas: HTMLCanvasElement, scene: MainScene): void {
    window.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      scene.onPointerMove(event.clientX - rect.left, event.clientY - rect.top);
    });

    canvas.addEventListener('pointerdown', () => {
      scene.onPointerDown();
    });

    window.addEventListener('keydown', (event) => {
      if (event.repeat) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
      }
      scene.onKeyDown(event.code);
    });
  }
}
