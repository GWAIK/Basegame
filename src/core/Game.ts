import { Application, BlurFilter, Container } from 'pixi.js';
import { AssetLoader } from '../assets/AssetLoader';
import { AudioPlayer } from '../audio/AudioPlayer';
import { Camera } from '../camera/Camera';
import type { ContentLibrary } from '../content/ContentLibrary';
import type { ActionDef, LevelDef, SceneDef, TriggerDef } from '../content/types';
import { devTools, setDevToolsEnabled } from '../debug/devTools';
import type { InkEffect } from '../dialogue/inkTags';
import { DialogueBox } from '../dialogue/DialogueBox';
import { DialogueManager } from '../dialogue/DialogueManager';
import { isPauseKey, PAUSE_CONFIG, PAUSE_KEYS } from '../pause/PauseConfig';
import { PauseMenu } from '../pause/PauseMenu';
import { StageScene } from '../scenes/StageScene';
import { EventBus } from './EventBus';
import type { GameEvents, SceneLocation } from './GameEvents';
import type { Scene } from './Scene';

/**
 * Owns the PixiJS application and everything that outlives a scene:
 * camera, dialogue, assets, content, and the event bus.
 *
 * stage
 *   play   <- blurred and frozen while paused
 *     world  <- camera moves this; the current scene's root lives here
 *     ui     <- dialogue, fixed on screen
 *   pause  <- resume, settings, main menu
 */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly assets = new AssetLoader();

  private readonly app = new Application();
  private readonly play = new Container({ label: 'play' });
  private readonly world = new Container({ label: 'world' });
  private readonly ui = new Container({ label: 'ui' });
  private readonly pauseMenu = new PauseMenu();
  private readonly blur = new BlurFilter({ strength: PAUSE_CONFIG.blur, quality: 4 });
  private readonly camera = new Camera(this.world);
  private readonly dialogue = new DialogueManager(new DialogueBox(this.ui));
  private readonly audio = new AudioPlayer();

  private scene: Scene | null = null;
  private currentLocation: SceneLocation | null = null;
  private loadToken = 0;
  private actionToken = 0;
  private paused = false;
  /** Game scene hidden while Settings was opened from the pause menu. */
  private returnToPause: { scene: StageScene; location: SceneLocation } | null = null;

  constructor(readonly content: ContentLibrary) {}

  get location(): SceneLocation | null {
    return this.currentLocation;
  }

  get isDialogueActive(): boolean {
    return this.dialogue.isActive;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Dimensions of the open scene in background pixels, if one is loaded. */
  get sceneDimensions(): { width: number; height: number } | null {
    return this.scene instanceof StageScene ? this.scene.dimensions : null;
  }

  async start(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x0b0c10,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    this.app.canvas.style.display = 'block';
    host.appendChild(this.app.canvas);
    this.play.addChild(this.world, this.ui);
    this.app.stage.addChild(this.play, this.pauseMenu.root);
    this.blur.repeatEdgePixels = true;
    this.pauseMenu.onSelect = (action) => this.onPauseSelect(action);
    this.handleResize();

    this.app.ticker.add((ticker) => {
      if (!this.paused) {
        this.camera.update(ticker.deltaMS);
        this.scene?.update(ticker.deltaMS);
        this.events.emit('update', { deltaMS: ticker.deltaMS });
      } else {
        this.blur.strength = PAUSE_CONFIG.blur;
        this.pauseMenu.update();
      }
    });
    this.app.renderer.on('resize', () => this.handleResize());
    document.addEventListener('fullscreenchange', () => this.refreshFullscreenLabel());
    this.bindInput();

    const level = this.content.level('menu') ?? this.content.firstLevel;
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
    this.actionToken += 1;
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

    if (this.returnToPause && !(level.id === 'menu' && definition.id === 'settings')) {
      this.returnToPause.scene.destroy();
      this.returnToPause = null;
    }

    const token = ++this.loadToken;
    const next = new StageScene(level, definition, this.content, this.assets);
    next.setTriggerHandler((trigger) => {
      void this.runActions(level, trigger.actions);
    });
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
    this.camera.setLocked(!definition.look);
    this.currentLocation = { levelId: level.id, sceneId: definition.id };
    this.app.canvas.style.cursor = '';
    this.world.addChild(next.root);
    this.events.emit('scene:enter', this.currentLocation);
    this.refreshFullscreenLabel();
    this.syncAmbience(level, definition);

    const entering = enterActions(definition);
    if (entering.length > 0) {
      void this.runActions(level, entering);
    }
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      await this.showNotice('Fullscreen is not available here.');
    }
    this.refreshFullscreenLabel();
  }

  /** The settings button says whether the game fills the screen. Escape leaves fullscreen too. */
  private refreshFullscreenLabel(): void {
    const trigger = this.fullscreenTrigger();
    if (!trigger) {
      return;
    }
    trigger.label = document.fullscreenElement ? 'Fullscreen: On' : 'Fullscreen: Off';
  }

  private fullscreenTrigger(): TriggerDef | null {
    if (!this.currentLocation) {
      return null;
    }
    const level = this.content.level(this.currentLocation.levelId);
    const scene = level ? this.content.scene(level, this.currentLocation.sceneId) : null;
    return scene?.triggers.find((trigger) => trigger.actions.some((action) => action.type === 'fullscreen')) ?? null;
  }

  private async toggleDevTools(): Promise<void> {
    await setDevToolsEnabled(this, !devTools.enabled);
    if (this.currentLocation) {
      await this.goTo(this.currentLocation.levelId, this.currentLocation.sceneId);
    }
  }

  /** Plays an Ink knot from content/story/story.ink. */
  playDialogue(dialogueId: string): void {
    void this.playDialogueAndWait(dialogueId);
  }

  /** Scales ambience and effects together. 1 is full, 0 is silent. */
  setMasterVolume(volume: number): void {
    this.audio.setMasterVolume(volume);
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
    this.pauseMenu.resize(width, height);
    this.scene?.resize(width, height);
    this.events.emit('resize', { width, height });
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    window.addEventListener('pointerdown', () => {
      this.audio.unlock();
    });

    window.addEventListener('pointermove', (event) => {
      const point = toCanvas(event);
      if (this.paused) {
        canvas.style.cursor = this.pauseMenu.hover(point.x, point.y) ? 'pointer' : '';
        return;
      }
      if (!this.scene?.isCapturingPointer()) {
        this.camera.setPointer(point.x, point.y);
      }
      const cursor = this.dialogue.hasChoices
        ? (this.dialogue.hover(point.x, point.y) ? 'pointer' : '')
        : this.dialogue.isActive
          ? null
          : (this.scene?.onPointerMove(point.x, point.y) ?? null);
      canvas.style.cursor = cursor ?? '';
    });

    canvas.addEventListener('pointerdown', (event) => {
      this.audio.unlock();
      const point = toCanvas(event);
      if (this.paused) {
        this.pauseMenu.pointerDown(point.x, point.y);
        return;
      }
      if (this.dialogue.isActive) {
        this.dialogue.advance(point.x, point.y);
        return;
      }
      this.scene?.onPointerDown(point.x, point.y);
    });

    window.addEventListener('pointerup', (event) => {
      if (this.paused || this.dialogue.isActive) {
        return;
      }
      const point = toCanvas(event);
      this.scene?.onPointerUp(point.x, point.y);
    });

    window.addEventListener('keydown', (event) => {
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      this.audio.unlock();
      if (event.code === 'Space') {
        event.preventDefault();
      }
      if (PAUSE_KEYS.listening) {
        return;
      }
      if (isPauseKey(event.code) && (this.paused || this.isPlaying())) {
        event.preventDefault();
        this.togglePause();
        return;
      }
      if (this.paused) {
        return;
      }

      if (this.dialogue.isActive) {
        if (this.dialogue.hasChoices && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) {
          event.preventDefault();
          this.dialogue.moveChoice(event.code === 'ArrowUp' ? -1 : 1);
        } else if (this.dialogue.hasChoices && (event.code === 'Enter' || event.code === 'Space')) {
          event.preventDefault();
          this.dialogue.confirmChoice();
        } else {
          const digit = choiceNumber(event.code);
          if (digit !== null) {
            this.dialogue.choose(digit);
          } else if (!this.dialogue.hasChoices && (event.code === 'Space' || event.code === 'Enter')) {
            this.dialogue.advance();
          } else if (event.code === 'Escape') {
            this.dialogue.close();
          }
        }
        return;
      }
      this.scene?.onKeyDown(event.code);
    });
  }

  /** Menus are the menu level. Pause only applies once Play has opened a level. */
  private isPlaying(): boolean {
    return this.currentLocation !== null && this.currentLocation.levelId !== 'menu';
  }

  private togglePause(): void {
    if (!this.scene || (!this.paused && !this.isPlaying())) {
      return;
    }
    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }
    this.paused = paused;
    this.play.filters = paused ? [this.blur] : null;
    this.blur.strength = PAUSE_CONFIG.blur;
    this.pauseMenu.setOpen(paused);
    this.app.canvas.style.cursor = '';
  }

  private onPauseSelect(action: 'resume' | 'settings' | 'menu'): void {
    const url = this.content.contentAssetUrl('/shared/audio/click.wav');
    if (url) {
      this.audio.playSound(url, 0.7);
    }
    if (action === 'settings' && this.scene instanceof StageScene && this.currentLocation) {
      const held = { scene: this.scene, location: this.currentLocation };
      this.world.removeChild(held.scene.root);
      this.scene = null;
      this.currentLocation = null;
      this.setPaused(false);
      void this.openSettingsFromPause(held);
      return;
    }
    this.setPaused(false);
    if (action === 'menu') {
      void this.goTo('menu');
    }
  }

  /** Settings stays the menu scene. Back returns to the paused scene instead of Main. */
  private async openSettingsFromPause(held: { scene: StageScene; location: SceneLocation }): Promise<void> {
    await this.goTo('menu', 'settings');
    if (this.returnToPause) {
      held.scene.destroy();
      return;
    }
    if (this.currentLocation?.levelId === 'menu' && this.currentLocation.sceneId === 'settings') {
      this.returnToPause = held;
      return;
    }
    if (!this.scene) {
      this.scene = held.scene;
      this.currentLocation = held.location;
      this.world.addChild(held.scene.root);
      if (!this.paused) {
        this.setPaused(true);
      }
      return;
    }
    held.scene.destroy();
  }

  private returnToPausedScene(): void {
    const held = this.returnToPause;
    this.returnToPause = null;
    if (!held) {
      return;
    }

    this.actionToken += 1;
    this.dialogue.close();
    if (this.scene && this.currentLocation) {
      this.events.emit('scene:exit', this.currentLocation);
      this.scene.destroy();
    }

    this.scene = held.scene;
    this.currentLocation = held.location;
    this.camera.setLocked(!held.scene.definition.look);
    this.world.addChild(held.scene.root);
    this.events.emit('scene:enter', held.location);
    this.refreshFullscreenLabel();
    this.syncAmbience(held.scene.level, held.scene.definition);
    this.setPaused(true);
  }

  /** Runs steps in order. A newer list, or a scene change, abandons this one. */
  private async runActions(level: LevelDef, actions: readonly ActionDef[]): Promise<void> {
    const token = ++this.actionToken;
    for (const action of actions) {
      if (token !== this.actionToken) {
        return;
      }
      if (action.type === 'sound') {
        const url = this.content.assetUrl(level.id, action.file);
        if (url) {
          this.audio.playSound(url, action.volume);
        }
      } else if (action.type === 'dialogue') {
        await this.playDialogueAndWait(action.id);
      } else if (action.type === 'shake') {
        this.shakeCamera(action.intensity, action.durationMs);
      } else if (action.type === 'go') {
        if (this.returnToPause && action.sceneId === 'main') {
          this.returnToPausedScene();
          return;
        }
        await this.goTo(level.id, action.sceneId);
        return;
      } else if (action.type === 'level') {
        await this.goTo(action.levelId);
        return;
      } else if (action.type === 'dev') {
        await this.toggleDevTools();
      } else if (action.type === 'fullscreen') {
        await this.toggleFullscreen();
      } else {
        window.close();
        await this.showNotice('Close this tab to leave.');
        return;
      }
    }
  }

  private showNotice(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.dialogue.start([{ speaker: '', text }], () => resolve());
    });
  }

  private async playDialogueAndWait(dialogueId: string): Promise<void> {
    const story = this.content.story;
    if (!story || !this.content.hasKnot(dialogueId)) {
      console.warn(`Dialogue "${dialogueId}" not found`);
      return;
    }

    this.events.emit('dialogue:start', { dialogueId });
    const ending = await this.dialogue.play(story, dialogueId, (effect) => {
      this.applyInkEffect(effect);
    });
    this.events.emit('dialogue:end', { dialogueId });
    await this.applyInkEnding(ending);
  }

  private applyInkEffect(effect: InkEffect): void {
    if (effect.type === 'sound') {
      const url = this.content.contentAssetUrl(effect.file);
      if (url) {
        this.audio.playSound(url, effect.volume);
      }
      return;
    }
    if (effect.type === 'shake') {
      this.shakeCamera(effect.intensity, effect.durationMs);
      return;
    }
    if (effect.type === 'event') {
      this.events.emit('dialogue:event', { name: effect.name });
    }
  }

  private async applyInkEnding(effect: InkEffect | null): Promise<void> {
    if (!effect) {
      return;
    }
    if (effect.type === 'go' && this.currentLocation) {
      await this.goTo(this.currentLocation.levelId, effect.sceneId);
      return;
    }
    if (effect.type === 'level') {
      await this.goTo(effect.levelId);
      return;
    }
    if (effect.type === 'quit') {
      window.close();
      await this.showNotice('Close this tab to leave.');
    }
  }

  private syncAmbience(level: LevelDef, scene: SceneDef): void {
    const cue = scene.ambience ?? level.ambience;
    if (!cue) {
      this.audio.playAmbience(null, 0);
      return;
    }
    const url = this.content.assetUrl(level.id, cue.file);
    if (!url) {
      return;
    }
    this.audio.playAmbience(url, cue.volume);
  }
}

/** The dialogue field is the first step, then anything listed in onEnter. */
function enterActions(scene: SceneDef): readonly ActionDef[] {
  if (!scene.dialogue) {
    return scene.onEnter;
  }
  return [{ type: 'dialogue', id: scene.dialogue }, ...scene.onEnter];
}

function choiceNumber(code: string): number | null {
  if (!/^Digit[1-9]$/.test(code)) {
    return null;
  }
  return Number(code.slice(5)) - 1;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
