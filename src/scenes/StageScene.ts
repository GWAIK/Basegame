import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { AnimatedWebp } from '../animation/AnimatedWebp';
import type { AssetLoader, LoadedImage } from '../assets/AssetLoader';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import type { ContentLibrary } from '../content/ContentLibrary';
import type { CharacterDef, LevelDef, SceneDef, TextDef, TriggerDef } from '../content/types';
import { Scene } from '../core/Scene';
import { devTools } from '../debug/devTools';
import { SceneHandles } from '../editor/SceneHandles';
import { Triggers } from '../triggers/Triggers';
import { fitScene } from './fitScene';

const PLACEHOLDER_WIDTH = 1920;
const PLACEHOLDER_HEIGHT = 1080;

/**
 * Draws one scene from a level.json: a background and characters placed in
 * background pixels. The whole scene is scaled as one, so characters stay on
 * their spot in the picture at any window size.
 */
export class StageScene extends Scene {
  private readonly animations: AnimatedWebp[] = [];
  private sceneWidth = PLACEHOLDER_WIDTH;
  private sceneHeight = PLACEHOLDER_HEIGHT;
  private readonly triggers: Triggers;
  private readonly characterViews: Container[] = [];
  private readonly textViews: Text[] = [];
  private readonly handles: SceneHandles | null;

  constructor(
    readonly level: LevelDef,
    readonly definition: SceneDef,
    private readonly content: ContentLibrary,
    private readonly assets: AssetLoader,
  ) {
    super();
    this.root.label = `scene:${level.id}/${definition.id}`;
    this.triggers = new Triggers(definition.triggers);
    this.foregroundLayer.addChild(this.triggers.root);
    this.handles = devTools.enabled
      ? new SceneHandles({
          scene: definition,
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

  get dimensions(): { width: number; height: number } {
    return { width: this.sceneWidth, height: this.sceneHeight };
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
      this.backgroundLayer.addChild(createBackgroundPlaceholder());
      return;
    }

    this.sceneWidth = image.texture.width;
    this.sceneHeight = image.texture.height;
    this.backgroundLayer.addChild(new Sprite(image.texture));
  }

  private addTexts(): void {
    if (this.definition.texts.length === 0) {
      return;
    }
    const layer = new Container();
    layer.label = 'texts';
    for (const item of this.definition.texts) {
      const text = createSceneText(item);
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
      this.definition.fit,
      this.viewWidth,
      this.viewHeight,
      this.sceneWidth,
      this.sceneHeight,
      CAMERA_CONFIG,
    );
    this.root.scale.set(transform.scale);
    this.root.position.set(transform.x, transform.y);
  }
}

function createBackgroundPlaceholder(): Graphics {
  const placeholder = new Graphics();
  placeholder.rect(0, 0, PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT).fill(0x10131a);
  return placeholder;
}

function createSceneText(item: TextDef): Text {
  const text = new Text({
    text: item.text,
    anchor: 0.5,
    style: {
      fill: '#f4f1ea',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: item.size,
      align: 'center',
      letterSpacing: item.size >= 48 ? 6 : 0.4,
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
