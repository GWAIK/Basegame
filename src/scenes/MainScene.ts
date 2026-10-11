import { Graphics, Sprite, type Container, type Texture } from 'pixi.js';
import { AssetLoader } from '../assets/AssetLoader';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import { Camera } from '../camera/Camera';
import { Scene } from '../core/Scene';
import { DialogueBox } from '../dialogue/DialogueBox';
import { DialogueManager } from '../dialogue/DialogueManager';
import { MAIN_DIALOGUE } from '../dialogue/mainScript';
import { LEVEL_1, levelAssetPath } from '../levels/level1';

export interface CharacterPlacement {
  x: number;
  y: number;
  scale?: number;
}

const SHAKE_MARGIN = 48;

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
  private mainCharacter: Container | null = null;

  constructor(world: Container, ui: Container) {
    super(world);
    this.camera = new Camera(world);
    this.dialogue = new DialogueManager(new DialogueBox(ui));
  }

  async init(width: number, height: number): Promise<void> {
    this.viewWidth = width;
    this.viewHeight = height;
    this.camera.setViewport(width, height);
    await this.loadBackground(LEVEL_1.sceneBackground);
    this.mainCharacter = await this.addCharacter('main.webp', {
      x: width / 2,
      y: height / 2,
      scale: 1,
    });
    this.dialogue.resize(width, height);
  }

  override update(deltaMS: number): void {
    this.camera.update(deltaMS);
  }

  override resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.camera.setViewport(width, height);
    this.layoutBackground();
    this.mainCharacter?.position.set(width / 2, height / 2);
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
  async loadBackground(filename: string): Promise<void> {
    this.backgroundTexture = await this.assets.load(
      `background:${LEVEL_1.id}:${filename}`,
      levelAssetPath(LEVEL_1.id, 'backgrounds', filename),
    );
    this.layoutBackground();
  }

  /**
   * Adds a PNG, JPG, or WEBP sprite to the character layer.
   * Missing files use a simple drawn figure. `scale` is the sprite scale.
   */
  async addCharacter(filename: string, options: CharacterPlacement): Promise<Container> {
    const texture = await this.assets.load(
      `character:${LEVEL_1.id}:${filename}`,
      levelAssetPath(LEVEL_1.id, 'characters', filename),
    );
    const scale = options.scale ?? 1;
    const display = texture
      ? this.createCharacterSprite(texture, scale)
      : this.createCharacterPlaceholder(scale);

    display.position.set(options.x, options.y);
    this.characterLayer.addChild(display);
    return display;
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

  private layoutBackground(): void {
    const padX = CAMERA_CONFIG.maxOffsetX + SHAKE_MARGIN;
    const padY = CAMERA_CONFIG.maxOffsetY + SHAKE_MARGIN;
    const texture = this.backgroundTexture;

    if (texture) {
      const sprite = this.ensureBackgroundSprite(texture);
      sprite.visible = true;
      if (this.backgroundPlaceholder) {
        this.backgroundPlaceholder.visible = false;
      }

      const targetWidth = this.viewWidth + padX * 2;
      const targetHeight = this.viewHeight + padY * 2;
      const scale = Math.max(targetWidth / texture.width, targetHeight / texture.height);
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
