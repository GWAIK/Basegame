import { Graphics, Sprite, type Container, type Texture } from 'pixi.js';
import { AnimatedWebp } from '../animation/AnimatedWebp';
import { AssetLoader } from '../assets/AssetLoader';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import { Camera } from '../camera/Camera';
import { Scene } from '../core/Scene';
import { DialogueBox } from '../dialogue/DialogueBox';
import { DialogueManager } from '../dialogue/DialogueManager';
import { MAIN_DIALOGUE } from '../dialogue/mainScript';
import { LEVEL_1, findScene, levelAssetPath, type SceneFit } from '../levels/level1';

/** Position and scale on the background image, in its pixels. */
export interface CharacterPlacement {
  x: number;
  y: number;
  scale?: number;
}

const SHAKE_MARGIN = 48;
const PLACEHOLDER_SCENE_WIDTH = 1920;
const PLACEHOLDER_SCENE_HEIGHT = 1080;

/**
 * The first cinematic scene.
 * Camera, dialogue, and layers are composed here and do not depend on each other.
 */
export class MainScene extends Scene {
  private readonly assets = new AssetLoader();
  private readonly camera: Camera;
  private readonly dialogue: DialogueManager;

  private viewWidth = 1;
  private viewHeight = 1;
  private backgroundTexture: Texture | null = null;
  private backgroundSprite: Sprite | null = null;
  private backgroundPlaceholder: Graphics | null = null;
  private readonly animations: AnimatedWebp[] = [];
  private loadGeneration = 0;
  private currentFit: SceneFit = 'cover';

  constructor(world: Container, ui: Container) {
    super(world);
    this.camera = new Camera(world);
    this.dialogue = new DialogueManager(new DialogueBox(ui));
  }

  async init(width: number, height: number): Promise<void> {
    this.viewWidth = width;
    this.viewHeight = height;
    this.camera.setViewport(width, height);
    await this.showScene(LEVEL_1.defaultSceneId);
    this.dialogue.resize(width, height);
  }

  /** Loads one of this level's scenes. A newer call cancels an in-flight load. */
  async showScene(sceneId: string): Promise<void> {
    const scene = findScene(LEVEL_1, sceneId);
    const generation = ++this.loadGeneration;
    this.clearSceneContent();
    this.currentFit = scene.fit;

    const loaded = await this.loadBackground(scene.background, generation, scene.fit === 'contain');
    if (!loaded) {
      return;
    }

    for (const character of scene.characters) {
      const added = await this.addCharacter(character.file, character, generation);
      if (!added) {
        return;
      }
    }

    if (generation !== this.loadGeneration) {
      return;
    }
    this.layoutBackground();
  }

  override update(deltaMS: number): void {
    this.camera.update(deltaMS);
    for (const animation of this.animations) {
      animation.update(deltaMS);
    }
  }

  override destroy(): void {
    for (const animation of this.animations) {
      animation.destroy();
    }
    this.animations.length = 0;
    super.destroy();
  }

  override resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.camera.setViewport(width, height);
    this.layoutBackground();
    this.dialogue.resize(width, height);
  }

  override onPointerMove(x: number, y: number): void {
    this.camera.setPointer(x, y);
  }

  override onPointerDown(): void {
    if (this.dialogue.isActive) {
      this.dialogue.advance();
    }
  }

  override onKeyDown(code: string): void {
    if (!this.dialogue.isActive) {
      return;
    }
    if (code === 'Space' || code === 'Enter') {
      this.dialogue.advance();
    } else if (code === 'Escape') {
      this.dialogue.close();
    }
  }

  startDialogue(): void {
    this.dialogue.start(MAIN_DIALOGUE);
  }

  shakeCamera(): void {
    this.camera.shake(10, 300);
  }

  resetCamera(): void {
    this.camera.reset();
  }

  /** Loads this level's background. A missing file uses a flat placeholder. */
  private async loadBackground(
    filename: string,
    generation: number,
    keepFullFrame: boolean,
  ): Promise<boolean> {
    const url = levelAssetPath(LEVEL_1.id, 'backgrounds', filename);
    if (filename.toLowerCase().endsWith('.webp')) {
      const animation = await AnimatedWebp.load(url, { trim: !keepFullFrame });
      if (generation !== this.loadGeneration) {
        animation?.destroy();
        return false;
      }
      if (animation) {
        this.animations.push(animation);
        this.backgroundTexture = animation.texture;
        this.ensureBackgroundSprite(animation.texture);
        return true;
      }
    }

    const texture = await this.assets.load(`background:${LEVEL_1.id}:${filename}`, url);
    if (generation !== this.loadGeneration) {
      return false;
    }
    this.backgroundTexture = texture;
    if (texture) {
      this.ensureBackgroundSprite(texture);
    }
    return true;
  }

  /**
   * Adds a PNG, JPG, or WEBP sprite to the character layer.
   * An animated WebP loops. A missing file uses a simple drawn figure.
   */
  async addCharacter(
    filename: string,
    options: CharacterPlacement,
    generation = this.loadGeneration,
  ): Promise<Container | null> {
    const url = levelAssetPath(LEVEL_1.id, 'characters', filename);
    const scale = options.scale ?? 1;
    const created = await this.createCharacterDisplay(filename, url, scale);
    if (generation !== this.loadGeneration) {
      created.animation?.destroy();
      created.display.destroy({ children: true, texture: false, textureSource: false });
      return null;
    }

    if (created.animation) {
      this.animations.push(created.animation);
    }
    created.display.position.set(options.x, options.y);
    this.characterLayer.addChild(created.display);
    return created.display;
  }

  private async createCharacterDisplay(
    filename: string,
    url: string,
    scale: number,
  ): Promise<{ display: Container; animation: AnimatedWebp | null }> {
    if (filename.toLowerCase().endsWith('.webp')) {
      const animation = await AnimatedWebp.load(url);
      if (animation) {
        return { display: this.createCharacterSprite(animation.texture, scale), animation };
      }
    }

    const texture = await this.assets.load(`character:${LEVEL_1.id}:${filename}`, url);
    return {
      display: texture
        ? this.createCharacterSprite(texture, scale)
        : this.createCharacterPlaceholder(scale),
      animation: null,
    };
  }

  private createCharacterSprite(texture: Texture, scale: number): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(scale);
    return sprite;
  }

  private createCharacterPlaceholder(scale: number): Graphics {
    const figure = new Graphics();
    figure.ellipse(0, 78, 36, 8).fill({ color: 0x000000, alpha: 0.35 });
    figure.roundRect(-26, 8, 52, 68, 16).fill(0xd9d3c7);
    figure.circle(0, -18, 22).fill(0xe7e1d6);
    figure.pivot.set(0, 18);
    figure.scale.set(scale);
    return figure;
  }

  private clearSceneContent(): void {
    const destroyView = { children: true, texture: false, textureSource: false } as const;
    for (const child of this.backgroundLayer.removeChildren()) {
      child.destroy(destroyView);
    }
    for (const child of this.characterLayer.removeChildren()) {
      child.destroy(destroyView);
    }
    for (const animation of this.animations) {
      animation.destroy();
    }
    this.animations.length = 0;
    this.backgroundSprite = null;
    this.backgroundPlaceholder = null;
    this.backgroundTexture = null;

    for (const layer of [this.middleLayer, this.characterLayer, this.foregroundLayer]) {
      layer.scale.set(1);
      layer.position.set(0, 0);
    }
  }

  private layoutBackground(): void {
    if (this.currentFit === 'contain') {
      this.layoutContainedBackground();
      return;
    }

    const padX = CAMERA_CONFIG.maxOffsetX + SHAKE_MARGIN;
    const padY = CAMERA_CONFIG.maxOffsetY + SHAKE_MARGIN;
    const texture = this.backgroundTexture;
    const sceneWidth = texture?.width ?? PLACEHOLDER_SCENE_WIDTH;
    const sceneHeight = texture?.height ?? PLACEHOLDER_SCENE_HEIGHT;
    const scale = Math.max(
      (this.viewWidth + padX * 2) / sceneWidth,
      (this.viewHeight + padY * 2) / sceneHeight,
    );
    const left = (this.viewWidth - sceneWidth * scale) / 2;
    const top = (this.viewHeight - sceneHeight * scale) / 2;

    this.middleLayer.scale.set(scale);
    this.middleLayer.position.set(left, top);
    this.characterLayer.scale.set(scale);
    this.characterLayer.position.set(left, top);
    this.foregroundLayer.scale.set(scale);
    this.foregroundLayer.position.set(left, top);

    if (texture) {
      const sprite = this.ensureBackgroundSprite(texture);
      sprite.visible = true;
      if (this.backgroundPlaceholder) {
        this.backgroundPlaceholder.visible = false;
      }

      sprite.scale.set(scale);
      sprite.position.set(this.viewWidth / 2, this.viewHeight / 2);
      return;
    }

    if (this.backgroundSprite) {
      this.backgroundSprite.visible = false;
    }

    const placeholder = this.ensureBackgroundPlaceholder();
    placeholder.visible = true;
    const width = this.viewWidth + padX * 2;
    const height = this.viewHeight + padY * 2;
    const horizon = Math.round(height * 0.58);

    placeholder.clear();
    placeholder.rect(0, 0, width, height).fill(0x10131a);
    placeholder.rect(0, horizon, width, height - horizon).fill(0x1a1e28);
    placeholder.rect(0, horizon, width, 2).fill({ color: 0xffffff, alpha: 0.08 });
    placeholder.position.set(-padX, -padY);
  }

  /** Uniform scale. The whole frame stays visible, with bars where the screen is a different shape. */
  private layoutContainedBackground(): void {
    const texture = this.backgroundTexture;
    if (!texture) {
      if (this.backgroundSprite) {
        this.backgroundSprite.visible = false;
      }
      return;
    }

    const sprite = this.ensureBackgroundSprite(texture);
    sprite.visible = true;
    if (this.backgroundPlaceholder) {
      this.backgroundPlaceholder.visible = false;
    }

    const padX = CAMERA_CONFIG.maxOffsetX + CAMERA_CONFIG.headbobX;
    const padY = CAMERA_CONFIG.maxOffsetY + CAMERA_CONFIG.headbobY;
    const scale = Math.min(
      (this.viewWidth - padX * 2) / texture.width,
      (this.viewHeight - padY * 2) / texture.height,
    );
    sprite.scale.set(scale);
    sprite.position.set(this.viewWidth / 2, this.viewHeight / 2);
  }

  private ensureBackgroundSprite(texture: Texture): Sprite {
    if (!this.backgroundSprite) {
      this.backgroundSprite = new Sprite(texture);
      this.backgroundSprite.anchor.set(0.5);
      this.backgroundLayer.addChild(this.backgroundSprite);
      return this.backgroundSprite;
    }

    this.backgroundSprite.texture = texture;
    return this.backgroundSprite;
  }

  private ensureBackgroundPlaceholder(): Graphics {
    if (!this.backgroundPlaceholder) {
      this.backgroundPlaceholder = new Graphics();
      this.backgroundLayer.addChild(this.backgroundPlaceholder);
    }
    return this.backgroundPlaceholder;
  }
}
