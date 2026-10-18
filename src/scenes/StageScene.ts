import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { AnimatedWebp } from '../animation/AnimatedWebp';
import type { AssetLoader, LoadedImage } from '../assets/AssetLoader';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import type { ContentLibrary } from '../content/ContentLibrary';
import type { CharacterDef, LevelDef, SceneDef, SceneFit, TextDef, TriggerDef } from '../content/types';
import { Scene } from '../core/Scene';
import { devTools } from '../debug/devTools';
import { SceneHandles } from '../editor/SceneHandles';
import { Triggers } from '../triggers/Triggers';
import { GAME_FONTS } from '../theme/fonts';
import { fitScene } from './fitScene';

const PLACEHOLDER_WIDTH = 1920;
const PLACEHOLDER_HEIGHT = 1080;

/**
 * Draws one scene from a level.json: a background and characters placed in
 * background pixels. The whole scene is scaled as one, so characters stay on
 * their spot in the picture at any window size.
 */
export class StageScene extends Scene {
  readonly definition: SceneDef;
  private readonly animations: AnimatedWebp[] = [];
  private sceneWidth = PLACEHOLDER_WIDTH;
  private sceneHeight = PLACEHOLDER_HEIGHT;
  private readonly triggers: Triggers;
  private readonly characterViews: Container[] = [];
  private readonly textViews: Text[] = [];
  private readonly handles: SceneHandles | null;
  private readonly compactMenu: boolean;
  private lookSlideX = 0;
  private fitMode: SceneFit;
  private backgroundPath: string | null;

  constructor(
    readonly level: LevelDef,
    definition: SceneDef,
    private readonly content: ContentLibrary,
    private readonly assets: AssetLoader,
    shopUnlocked = true,
  ) {
    super();
    this.compactMenu = level.id === 'menu' && definition.id === 'main' && !shopUnlocked;
    this.definition = this.compactMenu ? compactMainMenu(definition) : definition;
    this.fitMode = this.definition.fit;
    this.backgroundPath = this.definition.background;
    this.root.label = `scene:${level.id}/${this.definition.id}`;
    this.triggers = new Triggers(this.definition.triggers);
    if (this.compactMenu) {
      this.triggers.setLockedTriggers(new Set(['shop']));
    }
    this.foregroundLayer.addChild(this.triggers.root);
    this.handles = devTools.enabled
      ? new SceneHandles({
          scene: this.definition,
          root: this.root,
          background: this.backgroundLayer,
          characters: this.characterViews,
          texts: this.textViews,
          triggers: this.triggers,
          sceneSize: () => ({ width: this.sceneWidth, height: this.sceneHeight }),
        })
      : null;
    if (this.handles) {
      this.foregroundLayer.addChild(this.handles.overlay);
    }
  }

  /** What a trigger click does. The box itself lives in Triggers. */
  setTriggerHandler(handler: (trigger: TriggerDef) => void): void {
    this.triggers.onActivate = handler;
  }

  /** One-time triggers that already ran before this scene was opened. */
  setSpentTriggers(ids: ReadonlySet<string>): void {
    this.triggers.setSpentTriggers(ids);
  }

  consumeTrigger(id: string): void {
    this.triggers.consume(id);
  }

  releaseTrigger(id: string): void {
    this.triggers.release(id);
  }

  get dimensions(): { width: number; height: number } {
    return { width: this.sceneWidth, height: this.sceneHeight };
  }

  /** Extra screen-space shift for a Teleforum look. Cleared when the still settles. */
  setLookSlide(x: number): void {
    this.lookSlideX = x;
  }

  get currentBackground(): string | null {
    return this.backgroundPath;
  }

  async load(): Promise<void> {
    const background = this.definition.background;
    const [backgroundImage, ...characterImages] = await Promise.all([
      background ? this.loadImage(background, false) : Promise.resolve(null),
      ...this.definition.characters.map((character) => this.loadImage(character.image, true)),
    ]);
    if (this.destroyed) {
      return;
    }

    this.addBackground(backgroundImage);
    this.definition.characters.forEach((character, index) => {
      this.addCharacter(character, characterImages[index]);
    });
    this.addTexts();
    this.layout();
  }

  /** Lays out every frame, so live camera tuning in the debug panel applies at once. */
  override update(deltaMS: number): void {
    for (const animation of this.animations) {
      animation.update(deltaMS);
    }
    this.layout();
    this.handles?.sync(this.root.scale.x);
    this.triggers.sync(this.root.scale.x);
  }

  override onPointerDown(x: number, y: number): void {
    if (this.handles?.active) {
      this.handles.pointerDown(x, y);
      return;
    }
    this.triggers.pointerDown(x, y);
  }

  override onPointerMove(x: number, y: number): string | null {
    if (this.handles?.active) {
      return this.handles.pointerMove(x, y);
    }
    return this.triggers.pointerMove(x, y);
  }

  override onPointerUp(): void {
    if (this.handles?.active) {
      this.handles.pointerUp();
      return;
    }
    this.triggers.pointerUp();
  }

  override isCapturingPointer(): boolean {
    return this.handles?.isDragging === true || this.triggers.isDragging;
  }

  override destroy(): void {
    this.triggers.dispose();
    super.destroy();
    for (const animation of this.animations) {
      animation.destroy();
    }
    this.animations.length = 0;
  }

  /** A missing file returns null, and the scene draws a placeholder instead. */
  private async loadImage(path: string, trim: boolean): Promise<LoadedImage | null> {
    const url = this.content.assetUrl(this.level.id, path);
    if (!url) {
      return null;
    }

    const image = await this.assets.loadImage(url, { trim });
    if (image?.animation) {
      if (this.destroyed) {
        image.animation.destroy();
        return null;
      }
      this.animations.push(image.animation);
    }
    return image;
  }

  private addBackground(image: LoadedImage | null): void {
    if (!image) {
      this.backgroundLayer.addChild(createBackgroundPlaceholder(this.level.id === 'menu', this.compactMenu));
      return;
    }

    this.sceneWidth = image.texture.width;
    this.sceneHeight = image.texture.height;
    this.backgroundLayer.addChild(new Sprite(image.texture));
  }

  /** Swaps the picture in place. The scene keeps its size when the new image matches. */
  async replaceBackground(path: string, fit?: SceneFit): Promise<void> {
    const image = await this.loadImage(path, false);
    if (this.destroyed || !image) {
      return;
    }
    this.backgroundPath = path;
    this.fitMode = fit ?? this.definition.fit;
    const previous = this.backgroundLayer.removeChildren();
    this.addBackground(image);
    previous.forEach((child) => child.destroy());
    this.layout();
  }

  private addTexts(): void {
    if (this.definition.texts.length === 0) {
      return;
    }
    const isMenu = this.level.id === 'menu';
    const layer = new Container();
    layer.label = 'texts';
    for (const item of this.definition.texts) {
      const text = createSceneText(item, isMenu);
      this.textViews.push(text);
      layer.addChild(text);
    }
    this.foregroundLayer.addChildAt(layer, 0);
  }

  private addCharacter(character: CharacterDef, image: LoadedImage | null): void {
    const display: Container = image ? new Sprite(image.texture) : createCharacterPlaceholder();
    if (display instanceof Sprite) {
      display.anchor.set(0.5);
    }
    display.scale.set(character.scale);
    display.position.set(character.x, character.y);
    this.characterViews.push(display);
    this.characterLayer.addChild(display);
  }

  private layout(): void {
    const transform = fitScene(
      this.fitMode,
      this.viewWidth,
      this.viewHeight,
      this.sceneWidth,
      this.sceneHeight,
      CAMERA_CONFIG,
    );
    this.root.scale.set(transform.scale);
    this.root.position.set(transform.x + this.lookSlideX, transform.y);
  }
}

function compactMainMenu(scene: SceneDef): SceneDef {
  return {
    ...scene,
    texts: scene.texts.map((text) => ({
      ...text,
      y: text.y + 56,
    })),
    triggers: scene.triggers.map((trigger) => ({
      ...trigger,
      y: trigger.id === 'shop' ? trigger.y : trigger.y - 56,
    })),
  };
}

function createBackgroundPlaceholder(isMenu: boolean, compactMenu: boolean): Container {
  const root = new Container();
  const base = new Graphics();
  base.rect(0, 0, PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT).fill(isMenu ? 0xf6efe6 : 0x10131a);
  root.addChild(base);

  if (isMenu) {
    const glow = new Graphics();
    glow.circle(960, 540, 440).fill({ color: 0xefe2d1, alpha: 0.78 });
    glow.circle(960, 538, 290).fill({ color: 0xfbf7f2, alpha: 0.68 });

    const cardWidth = 640;
    const cardTop = compactMenu ? 340 : 284;
    const cardHeight = compactMenu ? 396 : 508;
    const dividerY = compactMenu ? 472 : 414;

    const shadow = new Graphics();
    shadow.roundRect(960 - cardWidth / 2, cardTop + 8, cardWidth, cardHeight, 44).fill({
      color: 0xd8c3ad,
      alpha: 0.32,
    });

    const card = new Graphics();
    card
      .roundRect(960 - cardWidth / 2, cardTop, cardWidth, cardHeight, 44)
      .fill({ color: 0xfffbf7, alpha: 0.98 })
      .stroke({ color: 0xe6d6c5, width: 2.5, alpha: 0.95 });

    const divider = new Graphics();
    divider.roundRect(960 - 56, dividerY, 112, 3, 1.5).fill({ color: 0xe6d6c5, alpha: 0.9 });

    root.addChild(glow, shadow, card, divider);
  }
  return root;
}

function createSceneText(item: TextDef, isMenu: boolean): Text {
  const isTimer = /^\d{2}:\d{2}$/.test(item.text.trim());
  const text = new Text({
    text: item.text,
    anchor: 0.5,
    style: {
      fill: isMenu ? (isTimer ? '#3d2e26' : '#4a372d') : '#f4ebe1',
      fontFamily: isTimer ? GAME_FONTS.mono : item.size >= 40 ? GAME_FONTS.display : GAME_FONTS.cozy,
      fontWeight: isTimer || item.size >= 40 ? '700' : '600',
      fontSize: item.size,
      align: 'center',
      letterSpacing: isTimer ? 4 : item.size >= 40 ? 0.6 : 0.4,
    },
  });
  text.position.set(item.x, item.y);
  return text;
}

function createCharacterPlaceholder(): Graphics {
  const figure = new Graphics();
  figure.ellipse(0, 78, 36, 8).fill({ color: 0x000000, alpha: 0.35 });
  figure.roundRect(-26, 8, 52, 68, 16).fill(0xd9d3c7);
  figure.circle(0, -18, 22).fill(0xe7e1d6);
  figure.pivot.set(0, 18);
  return figure;
}
