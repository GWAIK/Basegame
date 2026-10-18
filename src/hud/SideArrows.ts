import { Container, Sprite, Texture } from 'pixi.js';
import type { AssetLoader } from '../assets/AssetLoader';
import type { ContentLibrary } from '../content/ContentLibrary';

const BOB_MS = 1100;
/** Screen pixels. Outward when the wave is positive: left goes left, right goes right. */
const BOB_PX = 16;
const SIZE_RATIO = 0.13;
const EDGE_RATIO = -0.15;

/**
 * Level 3 side arrows in screen space, on the UI layer.
 * They sit on top of the square crop and ignore camera look, shake, and headbob.
 */
export class SideArrows {
  readonly root = new Container({ label: 'side-arrows' });

  private left: Sprite | null = null;
  private right: Sprite | null = null;
  private viewWidth = 1;
  private time = 0;
  private shown = false;

  constructor() {
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  async load(content: ContentLibrary, assets: AssetLoader): Promise<void> {
    if (this.left && this.right) {
      return;
    }
    const leftUrl = content.contentAssetUrl('/shared/ui/arrow-left.png');
    const rightUrl = content.contentAssetUrl('/shared/ui/arrow-right.png');
    const [leftImage, rightImage] = await Promise.all([
      leftUrl ? assets.loadImage(leftUrl, { trim: false }) : Promise.resolve(null),
      rightUrl ? assets.loadImage(rightUrl, { trim: false }) : Promise.resolve(null),
    ]);
    if (leftImage && !this.left) {
      this.left = makeArrow(leftImage.texture, 'arrow-left');
      this.root.addChild(this.left);
    }
    if (rightImage && !this.right) {
      this.right = makeArrow(rightImage.texture, 'arrow-right');
      this.root.addChild(this.right);
    }
    this.layout();
  }

  async show(content: ContentLibrary, assets: AssetLoader): Promise<void> {
    await this.load(content, assets);
    this.shown = true;
    this.time = 0;
    this.root.visible = true;
    this.layout();
  }

  hide(): void {
    this.shown = false;
    this.root.visible = false;
    this.time = 0;
  }

  get isVisible(): boolean {
    return this.shown;
  }

  resize(viewWidth: number): void {
    this.viewWidth = Math.max(viewWidth, 1);
    this.layout();
  }

  update(deltaMS: number): void {
    if (!this.shown) {
      return;
    }
    this.time += deltaMS;
    this.layout();
  }

  /** Screen point inside the square. Repeatable; a hit does not consume the arrow. */
  hitAt(x: number, y: number): 'arrow-left' | 'arrow-right' | null {
    if (!this.shown) {
      return null;
    }
    if (hits(this.left, x, y)) {
      return 'arrow-left';
    }
    if (hits(this.right, x, y)) {
      return 'arrow-right';
    }
    return null;
  }

  private layout(): void {
    const size = Math.round(this.viewWidth * SIZE_RATIO);
    const inset = Math.round(this.viewWidth * EDGE_RATIO) + size / 2;
    const y = this.viewWidth / 2;
    const wave = Math.sin((this.time / BOB_MS) * Math.PI * 2) * BOB_PX;
    if (this.left) {
      place(this.left, size, inset - wave, y);
    }
    if (this.right) {
      place(this.right, size, this.viewWidth - inset + wave, y);
    }
  }
}

function makeArrow(texture: Texture, label: string): Sprite {
  const sprite = new Sprite(texture);
  sprite.label = label;
  sprite.anchor.set(0.5);
  sprite.texture.source.scaleMode = 'nearest';
  sprite.roundPixels = true;
  return sprite;
}

function place(sprite: Sprite, size: number, x: number, y: number): void {
  sprite.width = size;
  sprite.height = size;
  sprite.position.set(x, y);
}

function hits(sprite: Sprite | null, x: number, y: number): boolean {
  if (!sprite) {
    return false;
  }
  const half = sprite.width / 2 + 12;
  return Math.abs(x - sprite.x) <= half && Math.abs(y - sprite.y) <= half;
}
