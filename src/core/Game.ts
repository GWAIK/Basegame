import { Application, Container } from 'pixi.js';
import { AssetLoader } from '../assets/AssetLoader';
import { Camera } from '../camera/Camera';
import type { ContentLibrary } from '../content/ContentLibrary';
import { DialogueBox } from '../dialogue/DialogueBox';
import { DialogueManager } from '../dialogue/DialogueManager';
import { StageScene } from '../scenes/StageScene';
import { EventBus } from './EventBus';
import type { GameEvents, SceneLocation } from './GameEvents';
import type { Scene } from './Scene';

/**
 * Owns the PixiJS application and everything that outlives a scene:
 * camera, dialogue, assets, content, and the event bus.
 *
 * stage
 *   world  <- camera moves this; the current scene's root lives here
 *   ui     <- dialogue, fixed on screen
 */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly assets = new AssetLoader();

  private readonly app = new Application();
  private readonly world = new Container({ label: 'world' });
  private readonly ui = new Container({ label: 'ui' });
  private readonly camera = new Camera(this.world);
  private readonly dialogue = new DialogueManager(new DialogueBox(this.ui));

  private scene: Scene | null = null;
  private currentLocation: SceneLocation | null = null;
  private loadToken = 0;

  constructor(readonly content: ContentLibrary) {}

  get location(): SceneLocation | null {
    return this.currentLocation;
  }

  get isDialogueActive(): boolean {
    return this.dialogue.isActive;
  }

  async start(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      background: 0x0b0c10,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    this.app.canvas.style.display = 'block';
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world, this.ui);
    this.handleResize();

    this.app.ticker.add((ticker) => {
      this.camera.update(ticker.deltaMS);
      this.scene?.update(ticker.deltaMS);
      this.events.emit('update', { deltaMS: ticker.deltaMS });
    });
    this.app.renderer.on('resize', () => this.handleResize());
    this.bindInput();

    const level = this.content.firstLevel;
    if (level) {
      await this.goTo(level.id);
    }
  }

  /**
   * Opens a scene. Without sceneId, opens the level's start scene.
   * The previous scene stays on screen until the new one has loaded.
   * A newer call wins over one that is still loading.
   */
  async goTo(levelId: string, sceneId?: string): Promise<void> {
    const level = this.content.level(levelId);
    if (!level) {
      console.warn(`Level "${levelId}" not found`);
      return;
    }
    const definition = this.content.scene(level, sceneId ?? level.startScene);
    if (!definition) {
      console.warn(`Scene "${sceneId}" not found in level "${levelId}"`);
      return;
    }

    const token = ++this.loadToken;
    const next = new StageScene(level, definition, this.content, this.assets);
    next.resize(this.app.screen.width, this.app.screen.height);
    await next.load();
    if (token !== this.loadToken) {
      next.destroy();
      return;
    }

    this.dialogue.close();
    if (this.scene && this.currentLocation) {
      this.events.emit('scene:exit', this.currentLocation);
      this.scene.destroy();
    }

    this.scene = next;
    this.currentLocation = { levelId: level.id, sceneId: definition.id };
    this.world.addChild(next.root);
    this.events.emit('scene:enter', this.currentLocation);

    if (definition.dialogue) {
      this.playDialogue(definition.dialogue);
    }
  }

  /** Plays a dialogue from content/dialogues by its file name. */
  playDialogue(dialogueId: string): void {
    const dialogue = this.content.dialogue(dialogueId);
    if (!dialogue) {
      console.warn(`Dialogue "${dialogueId}" not found`);
      return;
    }
    this.dialogue.close();
    this.events.emit('dialogue:start', { dialogueId });
    this.dialogue.start(dialogue.lines, () => {
      this.events.emit('dialogue:end', { dialogueId });
    });
  }

  shakeCamera(intensity = 10, durationMs = 300): void {
    this.camera.shake(intensity, durationMs);
  }

  resetCamera(): void {
    this.camera.reset();
  }

  private handleResize(): void {
    const { width, height } = this.app.screen;
    this.camera.setViewport(width, height);
    this.dialogue.resize(width, height);
    this.scene?.resize(width, height);
    this.events.emit('resize', { width, height });
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    window.addEventListener('pointermove', (event) => {
      const point = toCanvas(event);
      this.camera.setPointer(point.x, point.y);
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (this.dialogue.isActive) {
        this.dialogue.advance();
        return;
      }
      const point = toCanvas(event);
      this.scene?.onPointerDown(point.x, point.y);
    });

    window.addEventListener('keydown', (event) => {
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
      }

      if (this.dialogue.isActive) {
        if (event.code === 'Space' || event.code === 'Enter') {
          this.dialogue.advance();
        } else if (event.code === 'Escape') {
          this.dialogue.close();
        }
        return;
      }
      this.scene?.onKeyDown(event.code);
    });
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
