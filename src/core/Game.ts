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
import { buyInShopFirstMessage, dayCompleteMessage, noRoomThereMessage, DAY_COINS } from '../popup/dayReward';
import { Popup } from '../popup/Popup';
import { Progression } from '../progression/Progression';
import { NIGHT_STUDY_ID, WIRELESS_MOUSE_ID } from '../shop/catalog';
import { ShopScreen } from '../shop/ShopScreen';
import { Wallet } from '../shop/Wallet';
import { LevelTimer } from '../timer/LevelTimer';
import { TIMER_DRAIN_COLOR, TIMER_DRAIN_STEP_MS } from '../timer/TimerConfig';
import { LoadingScreen } from '../load/LoadingScreen';
import { LookTransition } from '../hud/LookTransition';
import { SideArrows } from '../hud/SideArrows';
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
 *     ui     <- dialogue and HUD, fixed on screen
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
  private readonly sideArrows = new SideArrows();
  private readonly lookTransition = new LookTransition();
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
  /** Level 1 has already snapped Iris's head up this visit. */
  private level1Caught = false;
  /** Level 3 has already glitched Iris out of the room this visit. */
  private level3Glitched = false;
  /** First side-arrow click started the ten-second look countdown. */
  private level3LookWait = false;
  private level3LookElapsed = 0;
  private dialogueToken = 0;
  private cursorNormal = 'auto';
  private cursorInteract = 'pointer';

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
      this.lookTransition.root,
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
    this.ui.addChildAt(this.sideArrows.root, 0);
    this.pauseLayer.addChild(this.pauseMenu.root);
    this.app.stage.addChild(this.play, this.pauseLayer);
    this.blur.repeatEdgePixels = true;
    this.pauseMenu.onSelect = (action) => this.onPauseSelect(action);
    this.levelTimer.onComplete = () => this.onTimerComplete();
    this.levelTimer.onChange = (remaining, previous) => this.onLevelTimerChange(remaining, previous);
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
      if (itemId === WIRELESS_MOUSE_ID) {
        this.progression.unlockMouse();
        this.shop.close();
        void this.popup.show({
          text: 'You can now interact with the world using your mouse.',
        });
        return;
      }
      if (itemId === NIGHT_STUDY_ID) {
        this.progression.unlockNightStudy();
      }
    };
    this.handleResize();

    this.app.ticker.add((ticker) => {
      if (!this.paused) {
        this.camera.update(ticker.deltaMS);
        this.levelTimer.update(ticker.deltaMS);
        this.sideArrows.update(ticker.deltaMS);
        this.lookTransition.update(ticker.deltaMS);
        this.focusScreen.update(ticker.deltaMS);
        this.scene?.update(ticker.deltaMS);
        this.tickLevel3LookWait(ticker.deltaMS);
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
    await this.applyCursors();
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
    this.lookTransition.cancel();
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
      if (level.id === 'level-1') {
        this.level1Caught = false;
      }
      if (level.id === 'level-3') {
        this.level3Glitched = false;
        this.level3LookWait = false;
        this.level3LookElapsed = 0;
      }
    }
    if (this.focusScreen.isUpdateWall) {
      this.focusScreen.close();
      this.sessionEnding = false;
    }
    this.currentLocation = { levelId: level.id, sceneId: definition.id };
    this.syncSideArrows();
    this.shop.close();
    this.shop.setOnMenu(level.id === 'menu' && this.progression.shopUnlocked);
    this.app.canvas.style.cursor = this.cursorNormal;
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

  /** Debug tool. Removes seconds from the level clock. */
  trimTimer(seconds: number): void {
    this.levelTimer.skip(seconds);
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
    this.sideArrows.resize(side);
    this.lookTransition.resize(side);
    this.shop.resize(side);
    this.focusScreen.resize(side);
    this.popup.resize(side);
    this.loading?.resize(side);
    this.events.emit('resize', { width: side, height: side });
  }

  /** normal.png at rest, interact.png over a button. Editor resize handles stay system cursors. */
  private async applyCursors(): Promise<void> {
    const normal = this.content.contentAssetUrl('/shared/cursors/normal.png');
    const interact = this.content.contentAssetUrl('/shared/cursors/interact.png');
    const [normalCursor, interactCursor] = await Promise.all([
      normal ? scaleCursor(normal, CURSOR_SCALE) : null,
      interact ? scaleCursor(interact, CURSOR_SCALE) : null,
    ]);
    if (normalCursor) {
      this.cursorNormal = normalCursor;
    }
    if (interactCursor) {
      this.cursorInteract = interactCursor;
    }
    this.app.canvas.style.cursor = this.cursorNormal;
  }

  private gameCursor(cursor: string | null): string {
    if (cursor === 'pointer') {
      return this.cursorInteract;
    }
    if (cursor === null || cursor === '') {
      return this.cursorNormal;
    }
    return cursor;
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
        canvas.style.cursor = this.gameCursor(this.pauseMenu.hover(point.x, point.y) ? 'pointer' : '');
        return;
      }
      if (this.popup.isOpen) {
        canvas.style.cursor = this.gameCursor(this.inScreen(point) && this.popup.hoverAt(point.x, point.y) ? 'pointer' : '');
        return;
      }
      if (this.shop.isOpen) {
        canvas.style.cursor = this.gameCursor(this.inScreen(point) && this.shop.hoverAt(point.x, point.y) ? 'pointer' : '');
        return;
      }
      if (this.focusScreen.isChoosing) {
        canvas.style.cursor = this.gameCursor(this.inScreen(point) && this.focusScreen.hoverAt(point.x, point.y) ? 'pointer' : '');
        return;
      }
      if (!this.scene?.isCapturingPointer()) {
        this.camera.setPointer(point.x, point.y);
      }
      const cursor = this.dialogue.hasChoices
        ? (this.dialogue.hover(point.x, point.y) ? 'pointer' : '')
        : this.dialogue.isActive
          ? null
          : this.sideArrows.hitAt(point.x, point.y)
            ? 'pointer'
            : (this.inScreen(point) ? (this.scene?.onPointerMove(point.x, point.y) ?? null) : null);
      canvas.style.cursor = this.gameCursor(cursor);
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
      const arrow = this.sideArrows.hitAt(point.x, point.y);
      if (arrow) {
        void this.onSideArrow(arrow);
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
      if (event.code === 'F6' && event.shiftKey) {
        event.preventDefault();
        void this.toggleDevTools();
        return;
      }
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
    this.app.canvas.style.cursor = this.cursorNormal;
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
    this.syncSideArrows();
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
    if (this.progression.needsNightStudy) {
      await this.popup.show(noRoomThereMessage());
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
    if (this.currentLocation?.levelId === 'level-3') {
      void this.startLevel3Wall();
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

  private onLevelTimerChange(remaining: number, previous: number): void {
    this.tryLevel1Caught(remaining, previous);
    this.tryLevel3Glitch(remaining, previous);
  }

  private tryLevel1Caught(remaining: number, previous: number): void {
    if (this.level1Caught || this.currentLocation?.levelId !== 'level-1') {
      return;
    }
    if (!(previous > 20 && remaining <= 20)) {
      return;
    }
    this.level1Caught = true;
    this.levelTimer.freezeAt(20);
    this.camera.setZoomed(false);
    this.actionToken += 1;
    const riseUrl = this.content.contentAssetUrl('/shared/audio/riseup.mp3');
    this.audio.playAmbience(riseUrl, 0.7, 16);
    if (this.scene instanceof StageScene) {
      this.scene.consumeTrigger('trigger-1');
      this.scene.consumeTrigger('trigger-2');
      void this.scene.replaceBackground('day-study-look.png');
    }
    void this.playDialogueAndWait('level1_caught').then(() => {
      this.kickOutOfStudy();
    });
  }

  private tryLevel3Glitch(remaining: number, previous: number): void {
    if (this.level3Glitched || this.currentLocation?.levelId !== 'level-3') {
      return;
    }
    if (!(previous > 57 && remaining <= 57)) {
      return;
    }
    this.level3Glitched = true;
    const glitch = this.content.contentAssetUrl('/shared/audio/glitch.mp3');
    if (glitch) {
      this.audio.playSound(glitch, 0.55);
    }
    this.audio.playAmbience(null, 0);
    this.shakeCamera(16, 420);
    if (this.scene instanceof StageScene) {
      const scene = this.scene;
      void scene.replaceBackground('night-study-no-iris.jpg').then(() => {
        if (this.scene !== scene || this.currentLocation?.levelId !== 'level-3') {
          return;
        }
        void this.sideArrows.show(this.content, this.assets);
      });
    }
  }

  /** HUD arrows live on the UI layer. They only belong on glitched level 3. */
  private syncSideArrows(): void {
    if (this.currentLocation?.levelId === 'level-3' && this.level3Glitched) {
      void this.sideArrows.show(this.content, this.assets);
      return;
    }
    this.sideArrows.hide();
  }

  /** Left looks left, right looks right. Both stills fade through black. */
  private async onSideArrow(arrow: 'arrow-left' | 'arrow-right'): Promise<void> {
    if (this.lookTransition.busy || this.sessionEnding) {
      return;
    }
    if (!(this.scene instanceof StageScene) || this.currentLocation?.levelId !== 'level-3') {
      return;
    }
    const scene = this.scene;
    if (!this.level3LookWait) {
      this.level3LookWait = true;
      this.level3LookElapsed = 0;
    }
    const inBackRoom = (scene.currentBackground ?? '').includes('back-room');
    const next = inBackRoom
      ? { path: 'night-study-no-iris.jpg', fit: 'width' as const }
      : { path: 'back-room.webp', fit: 'height' as const };
    const direction = arrow === 'arrow-right' ? 1 : -1;
    await this.lookTransition.play(direction, scene, () => scene.replaceBackground(next.path, next.fit));
  }

  private tickLevel3LookWait(deltaMS: number): void {
    if (!this.level3LookWait || this.sessionEnding || this.currentLocation?.levelId !== 'level-3') {
      return;
    }
    this.level3LookElapsed += deltaMS;
    if (this.level3LookElapsed >= 10_000) {
      void this.startLevel3Wall();
    }
  }

  /** Blackout, Iris, then a fake store wall. Pause is blocked while this is up. */
  private async startLevel3Wall(): Promise<void> {
    if (this.sessionEnding || this.currentLocation?.levelId !== 'level-3') {
      return;
    }
    this.sessionEnding = true;
    this.level3LookWait = false;
    this.lookTransition.cancel();
    this.sideArrows.hide();
    this.levelTimer.setVisible(false);
    this.camera.setLocked(true);
    this.actionToken += 1;
    const token = ++this.focusToken;
    await this.focusScreen.fadeToBlack(700);
    if (token !== this.focusToken) {
      this.sessionEnding = false;
      return;
    }
    await this.playDialogueAndWait('level3_snooped');
    if (token !== this.focusToken) {
      this.focusScreen.close();
      this.sessionEnding = false;
      return;
    }
    this.focusScreen.showUpdateWall();
  }

  private kickOutOfStudy(): void {
    if (this.currentLocation?.levelId !== 'level-1' || this.sessionEnding) {
      return;
    }
    this.levelTimer.drainToZero(TIMER_DRAIN_COLOR, TIMER_DRAIN_STEP_MS);
  }

  private async playDialogueAndWait(dialogueId: string, zoom = false): Promise<void> {
    const story = this.content.story;
    if (!story || !this.content.hasKnot(dialogueId)) {
      console.warn(`Dialogue "${dialogueId}" not found`);
      return;
    }

    const token = ++this.dialogueToken;
    if (zoom) {
      this.camera.setZoomed(true);
    }
    this.events.emit('dialogue:start', { dialogueId });
    const ending = await this.dialogue.play(story, dialogueId, (effect) => {
      this.applyInkEffect(effect);
    });
    if (token !== this.dialogueToken) {
      return;
    }
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
      if (effect.name === 'level1_kick') {
        this.kickOutOfStudy();
      }
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

const CURSOR_SCALE = 2;

/** A custom cursor image. The tip sits on the top-left pixel. */
function cursorUrl(url: string): string {
  return `url("${url}") 0 0, auto`;
}

/** Draws the cursor bigger without blurring its pixels. Browsers ignore a CSS scale on cursor images. */
async function scaleCursor(url: string, scale: number): Promise<string> {
  try {
    const image = await loadCursorImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0) {
      return cursorUrl(url);
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      return cursorUrl(url);
    }
    return cursorUrl(URL.createObjectURL(blob));
  } catch {
    return cursorUrl(url);
  }
}

function loadCursorImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load cursor ${url}`));
    image.src = url;
  });
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
