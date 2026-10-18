import { Application, BlurFilter, Container, Graphics, type Texture } from 'pixi.js';
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
import { FocusScreen } from '../focus/FocusScreen';
import { buyInShopFirstMessage, dayCompleteMessage, DAY_COINS } from '../popup/dayReward';
import { Popup } from '../popup/Popup';
import { Progression } from '../progression/Progression';
import { WIRELESS_MOUSE_ID } from '../shop/catalog';
import { ShopScreen } from '../shop/ShopScreen';
import { Wallet } from '../shop/Wallet';
import { LevelTimer } from '../timer/LevelTimer';
import { LoadingScreen } from '../load/LoadingScreen';
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
  private readonly screen = new Container({ label: 'screen' });
  private readonly screenMask = new Graphics({ label: 'screen-mask' });
  private readonly world = new Container({ label: 'world' });
  private readonly ui = new Container({ label: 'ui' });
  private readonly pauseLayer = new Container({ label: 'pause-layer' });
  private readonly pauseMenu = new PauseMenu();
  private readonly levelTimer = new LevelTimer();
  private readonly progression = new Progression();
  private readonly wallet = new Wallet();
  private readonly shop = new ShopScreen(this.wallet);
  private readonly focusScreen = new FocusScreen();
  private readonly popup = new Popup();
  private loading: LoadingScreen | null = new LoadingScreen();
  private readonly blur = new BlurFilter({ strength: PAUSE_CONFIG.blur, quality: 4 });
  private readonly camera = new Camera(this.world);
  private readonly portraitCache = new Map<string, Promise<Texture | null>>();
  private readonly dialogue = new DialogueManager(new DialogueBox(this.ui), (speaker) => this.portraitTexture(speaker));
  private readonly audio = new AudioPlayer();

  private scene: Scene | null = null;
  private currentLocation: SceneLocation | null = null;
  /** level/scene/trigger ids that already ran. Cleared when the page reloads. */
  private readonly spentTriggers = new Set<string>();
  private loadToken = 0;
  private actionToken = 0;
  private focusToken = 0;
  private paused = false;
  private screenX = 0;
  private screenY = 0;
  private screenSide = 1;
  /** Game scene hidden while Settings was opened from the pause menu. */
  private returnToPause: { scene: StageScene; location: SceneLocation } | null = null;
  /** Settings opened from pause hides the level clock without resetting it. */
  private keepTimer = false;
  /** The minute ran out. Fade, narrate, then leave for the menu. */
  private sessionEnding = false;

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
      background: 0x000000,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    this.app.canvas.style.display = 'block';
    host.appendChild(this.app.canvas);
    const loading = this.loading;
    this.screen.addChild(
      this.world,
      this.levelTimer.root,
      this.shop.root,
      this.focusScreen.root,
      this.popup.root,
    );
    if (loading) {
      this.screen.addChild(loading.root);
    }
    this.screen.mask = this.screenMask;
    this.play.addChild(this.screen, this.screenMask, this.ui);
    this.pauseLayer.addChild(this.pauseMenu.root);
    this.app.stage.addChild(this.play, this.pauseLayer);
    this.blur.repeatEdgePixels = true;
    this.pauseMenu.onSelect = (action) => this.onPauseSelect(action);
    this.levelTimer.onComplete = () => this.onTimerComplete();
    this.popup.onDismiss = () => {
      const url = this.content.contentAssetUrl('/shared/audio/click.wav');
      if (url) {
        this.audio.playSound(url, 0.7);
      }
    };
    this.shop.onPurchase = (itemId, bought) => {
      if (!bought) {
        return;
      }
      const url = this.content.contentAssetUrl('/shared/audio/click.wav');
      if (url) {
        this.audio.playSound(url, 0.55);
      }
      if (itemId !== WIRELESS_MOUSE_ID) {
        return;
      }
      this.progression.unlockMouse();
      this.shop.close();
      void this.popup.show({
        text: 'You can now interact with the world using your mouse.',
      });
    };
    this.handleResize();

    this.app.ticker.add((ticker) => {
      if (!this.paused) {
        this.camera.update(ticker.deltaMS);
        this.levelTimer.update(ticker.deltaMS);
        this.focusScreen.update(ticker.deltaMS);
        this.scene?.update(ticker.deltaMS);
        this.dialogue.refresh();
        this.events.emit('update', { deltaMS: ticker.deltaMS });
      } else {
        this.blur.strength = PAUSE_CONFIG.blur;
        this.levelTimer.refresh();
        this.pauseMenu.update();
      }
    });
    this.app.renderer.on('resize', () => this.handleResize());
    document.addEventListener('fullscreenchange', () => this.refreshFullscreenLabel());
    this.bindInput();
    await this.preloadAssets();

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
    const previousLevelId = this.currentLocation?.levelId ?? null;
    const keepTimer = this.keepTimer;
    this.keepTimer = false;
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
    const next = new StageScene(level, definition, this.content, this.assets, this.progression.shopUnlocked);
    next.setSpentTriggers(this.spentIds(level.id, definition.id));
    next.setTriggerHandler((trigger) => {
      if (trigger.once) {
        this.spentTriggers.add(this.triggerKey(level.id, definition.id, trigger.id));
        next.consumeTrigger(trigger.id);
      }
      void this.runActions(level, trigger.actions, true);
    });
    next.resize(this.screenSide, this.screenSide);
    await next.load();
    if (token !== this.loadToken) {
      next.destroy();
      return;
    }

    this.dialogue.close();
    this.camera.setZoomed(false);
    if (this.scene && this.currentLocation) {
      this.events.emit('scene:exit', this.currentLocation);
      this.scene.destroy();
    }

    this.scene = next;
    this.camera.setLocked(level.id === 'menu');
    if (keepTimer) {
      this.levelTimer.setVisible(false);
    } else if (previousLevelId !== level.id) {
      this.levelTimer.enter(level.id);
    }
    this.currentLocation = { levelId: level.id, sceneId: definition.id };
    this.shop.close();
    this.shop.setOnMenu(level.id === 'menu' && this.progression.shopUnlocked);
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

  /** One load per speaker. "Iris" reads content/shared/portraits/iris.webp. */
  private portraitTexture(speaker: string): Promise<Texture | null> {
    const name = speaker.trim().toLowerCase();
    const cached = this.portraitCache.get(name);
    if (cached) {
      return cached;
    }
    const pending = this.loadPortrait(name);
    this.portraitCache.set(name, pending);
    return pending;
  }

  private async loadPortrait(name: string): Promise<Texture | null> {
    const url = this.content.portraitUrl(name);
    if (!url) {
      console.warn(`No portrait for "${name}". Add content/shared/portraits/${name}.webp`);
      return null;
    }
    const image = await this.assets.loadImage(url, { trim: false });
    return image?.texture ?? null;
  }

  /** Plays an Ink knot from content/story/story.ink. */
  playDialogue(dialogueId: string): void {
    void this.playDialogueAndWait(dialogueId);
  }

  /**
   * Dev tool. A one-time trigger disappears after it runs.
   * Turning it off brings a spent trigger back.
   */
  setTriggerOnce(trigger: TriggerDef, once: boolean): void {
    trigger.once = once;
    const location = this.currentLocation;
    if (!location || once) {
      return;
    }
    this.spentTriggers.delete(this.triggerKey(location.levelId, location.sceneId, trigger.id));
    if (this.scene instanceof StageScene) {
      this.scene.releaseTrigger(trigger.id);
    }
  }

  private triggerKey(levelId: string, sceneId: string, triggerId: string): string {
    return `${levelId}/${sceneId}/${triggerId}`;
  }

  private spentIds(levelId: string, sceneId: string): Set<string> {
    const prefix = `${levelId}/${sceneId}/`;
    const ids = new Set<string>();
    for (const key of this.spentTriggers) {
      if (key.startsWith(prefix)) {
        ids.add(key.slice(prefix.length));
      }
    }
    return ids;
  }

  /** Scales ambience and effects together. 1 is full, 0 is silent. */
  setMasterVolume(volume: number): void {
    this.audio.setMasterVolume(volume);
  }

  get isTimerHeld(): boolean {
    return this.levelTimer.isHeld;
  }

  /** Freezes the level clock without pausing the rest of the game. */
  holdTimer(held: boolean): void {
    this.levelTimer.setHeld(held);
  }

  shakeCamera(intensity = 10, durationMs = 300): void {
    this.camera.shake(intensity, durationMs);
  }

  resetCamera(): void {
    this.camera.reset();
  }

  /** Decodes every image and sound before the menu appears. */
  private async preloadAssets(): Promise<void> {
    const files = this.content.preloadFiles();
    const loading = this.loading;
    loading?.setProgress(0, files.length);
    await paintFrame();
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) {
        continue;
      }
      try {
        if (file.kind === 'image') {
          await this.assets.preload(file.url, file.trim);
        } else {
          await this.audio.preload(file.url);
        }
      } catch (error) {
        console.warn(`Could not preload ${file.url}`, error);
      }
      loading?.setProgress(index + 1, files.length);
      await paintFrame();
    }
    if (loading) {
      this.screen.removeChild(loading.root);
      loading.destroy();
      this.loading = null;
    }
  }

  private handleResize(): void {
    const { width, height } = this.app.screen;
    const marginY = 36;
    const side = Math.floor(Math.min(width, Math.max(1, height - marginY * 2)));
    this.screenSide = side;
    this.screenX = Math.floor((width - side) / 2);
    this.screenY = Math.floor((height - side) / 2);
    this.screen.position.set(this.screenX, this.screenY);
    this.ui.position.set(this.screenX, this.screenY);
    this.pauseLayer.position.set(this.screenX, this.screenY);
    this.screenMask.clear();
    this.screenMask.roundRect(this.screenX, this.screenY, side, side, side * 0.06).fill(0xffffff);

    this.camera.setViewport(side, side);
    this.dialogue.resize(side, side);
    this.pauseMenu.resize(side, side);
    this.scene?.resize(side, side);
    this.levelTimer.resize(side);
    this.shop.resize(side);
    this.focusScreen.resize(side);
    this.popup.resize(side);
    this.loading?.resize(side);
    this.events.emit('resize', { width: side, height: side });
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    const toScreen = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left - this.screenX,
        y: event.clientY - rect.top - this.screenY,
      };
    };

    window.addEventListener('pointerdown', () => {
      this.audio.unlock();
    });

    window.addEventListener('pointermove', (event) => {
      const point = toScreen(event);
      if (this.paused) {
        canvas.style.cursor = this.pauseMenu.hover(point.x, point.y) ? 'pointer' : '';
        return;
      }
      if (this.popup.isOpen) {
        canvas.style.cursor = this.inScreen(point) && this.popup.hoverAt(point.x, point.y) ? 'pointer' : '';
        return;
      }
      if (this.shop.isOpen) {
        canvas.style.cursor = this.inScreen(point) && this.shop.hoverAt(point.x, point.y) ? 'pointer' : '';
        return;
      }
      if (this.focusScreen.isChoosing) {
        canvas.style.cursor = this.inScreen(point) && this.focusScreen.hoverAt(point.x, point.y) ? 'pointer' : '';
        return;
      }
      if (!this.scene?.isCapturingPointer()) {
        this.camera.setPointer(point.x, point.y);
      }
      const cursor = this.dialogue.hasChoices
        ? (this.dialogue.hover(point.x, point.y) ? 'pointer' : '')
        : this.dialogue.isActive
          ? null
          : (this.inScreen(point) ? (this.scene?.onPointerMove(point.x, point.y) ?? null) : null);
      canvas.style.cursor = cursor ?? '';
    });

    canvas.addEventListener('pointerdown', (event) => {
      this.audio.unlock();
      const point = toScreen(event);
      if (this.paused) {
        this.pauseMenu.pointerDown(point.x, point.y);
        return;
      }
      if (this.dialogue.isActive) {
        this.dialogue.advance(point.x, point.y);
        return;
      }
      if (this.popup.isOpen) {
        if (this.inScreen(point)) {
          this.popup.pointerDown(point.x, point.y);
        }
        return;
      }
      if (this.focusScreen.isOpen) {
        if (this.focusScreen.isChoosing && this.inScreen(point)) {
          this.focusScreen.pointerDown(point.x, point.y);
        }
        return;
      }
      if (this.shop.isOpen) {
        if (this.inScreen(point)) {
          this.shop.pointerDown(point.x, point.y);
        }
        return;
      }
      if (this.inScreen(point)) {
        this.scene?.onPointerDown(point.x, point.y);
      }
    });

    window.addEventListener('pointerup', (event) => {
      this.audio.unlock();
      if (this.paused || this.dialogue.isActive || this.popup.isOpen || this.shop.isOpen || this.focusScreen.isOpen) {
        return;
      }
      const point = toScreen(event);
      this.scene?.onPointerUp(point.x, point.y);
    });

    window.addEventListener('click', () => {
      this.audio.unlock();
    });

    window.addEventListener('wheel', (event) => {
      if (this.shop.isOpen) {
        this.shop.wheel(event.deltaY);
      }
    }, { passive: true });

    window.addEventListener('keydown', (event) => {
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      this.audio.unlock();
      if (this.popup.isOpen) {
        if (event.code === 'Enter' || event.code === 'Space' || event.code === 'Escape') {
          event.preventDefault();
          this.popup.dismiss();
        }
        return;
      }
      if (this.focusScreen.isChoosing) {
        if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
          event.preventDefault();
          this.focusScreen.nudge(event.code === 'ArrowUp' ? -1 : 1);
          return;
        }
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          this.focusScreen.confirm();
          return;
        }
        if (event.code === 'Escape') {
          event.preventDefault();
          this.focusScreen.cancel();
          return;
        }
      }
      if (this.shop.isOpen && event.code === 'Escape') {
        event.preventDefault();
        this.shop.close();
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
      }
      if (PAUSE_KEYS.listening) {
        return;
      }
      if (!this.sessionEnding && isPauseKey(event.code) && (this.paused || this.isPlaying())) {
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
    this.camera.setZoomed(false);
          }
        }
        return;
      }
      this.scene?.onKeyDown(event.code);
    });
  }

  /** Menus are the menu level. Pause only applies once Play has opened a level. */
  private inScreen(point: { x: number; y: number }): boolean {
    return point.x >= 0 && point.x <= this.screenSide && point.y >= 0 && point.y <= this.screenSide;
  }

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
    this.audio.setPaused(paused);
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
    this.keepTimer = true;
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
    this.camera.setZoomed(false);
    if (this.scene && this.currentLocation) {
      this.events.emit('scene:exit', this.currentLocation);
      this.scene.destroy();
    }

    this.scene = held.scene;
    this.currentLocation = held.location;
    this.camera.setLocked(false);
    this.levelTimer.setVisible(true);
    this.world.addChild(held.scene.root);
    this.events.emit('scene:enter', held.location);
    this.refreshFullscreenLabel();
    this.syncAmbience(held.scene.level, held.scene.definition);
    this.setPaused(true);
  }

  /** Runs steps in order. A newer list, or a scene change, abandons this one. */
  private async runActions(level: LevelDef, actions: readonly ActionDef[], fromTrigger = false): Promise<void> {
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
        await this.playDialogueAndWait(action.id, fromTrigger && level.id !== 'menu');
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
      } else if (action.type === 'shop') {
        this.shop.openShop();
      } else if (action.type === 'focus') {
        await this.runFocus();
      } else {
        window.close();
        await this.showNotice('Close this tab to leave.');
        return;
      }
    }
  }

  /**
   * Black screen, one minute only, then the narrator, then the first level.
   * The length cannot move. That is the story.
   */
  private async runFocus(): Promise<void> {
    if (this.progression.shopUnlocked && !this.progression.mouseOwned) {
      await this.popup.show(buyInShopFirstMessage());
      return;
    }
    const token = ++this.focusToken;
    const choice = await this.focusScreen.open();
    if (token !== this.focusToken) {
      return;
    }
    if (choice !== 'ok') {
      this.focusScreen.close();
      return;
    }
    const url = this.content.contentAssetUrl('/shared/audio/click.wav');
    if (url) {
      this.audio.playSound(url, 0.7);
    }
    await this.playDialogueAndWait('focus_begin');
    if (token !== this.focusToken) {
      this.focusScreen.close();
      return;
    }
    const nextLevelId = this.content.level(this.progression.focusLevelId)?.id ?? 'level-0';
    await this.goTo(nextLevelId);
    if (token !== this.focusToken) {
      return;
    }
    this.focusScreen.close();
  }

  /** 00:00. The frame fades out, a narrator closes the day, then the menu returns. */
  private onTimerComplete(): void {
    if (this.sessionEnding || !this.isPlaying()) {
      return;
    }
    void this.endSession();
  }

  private async endSession(): Promise<void> {
    if (this.sessionEnding) {
      return;
    }
    this.sessionEnding = true;
    const token = ++this.focusToken;
    this.actionToken += 1;
    while (this.dialogue.isActive && token === this.focusToken) {
      await wait(40);
    }
    if (token !== this.focusToken) {
      this.sessionEnding = false;
      return;
    }
    await this.focusScreen.fadeToBlack(900);
    if (token !== this.focusToken) {
      this.sessionEnding = false;
      return;
    }
    await this.playDialogueAndWait('focus_end');
    if (token !== this.focusToken) {
      this.focusScreen.close();
      this.sessionEnding = false;
      return;
    }
    const unlockedShop = this.progression.completeDay();
    this.wallet.earn(DAY_COINS);
    await this.goTo('menu');
    if (token !== this.focusToken) {
      return;
    }
    this.focusScreen.close();
    this.sessionEnding = false;
    if (this.currentLocation?.levelId !== 'menu') {
      return;
    }
    await this.popup.show(dayCompleteMessage(unlockedShop));
  }

  private showNotice(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.dialogue.start([{ speaker: '', text }], () => resolve());
    });
  }

  private async playDialogueAndWait(dialogueId: string, zoom = false): Promise<void> {
    const story = this.content.story;
    if (!story || !this.content.hasKnot(dialogueId)) {
      console.warn(`Dialogue "${dialogueId}" not found`);
      return;
    }

    if (zoom) {
      this.camera.setZoomed(true);
    }
    this.events.emit('dialogue:start', { dialogueId });
    const ending = await this.dialogue.play(story, dialogueId, (effect) => {
      this.applyInkEffect(effect);
    });
    if (zoom) {
      this.camera.setZoomed(false);
    }
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
    if (!effect || this.sessionEnding) {
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Lets the loading counter paint before the next file is decoded. */
function paintFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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
