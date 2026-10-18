import { Assets, Texture } from 'pixi.js';
import { AnimatedWebp } from '../animation/AnimatedWebp';
import { webpIsAnimated } from '../animation/webpChunks';

export interface LoadedImage {
  texture: Texture;
  /** Set for an animated WebP. Its owner must call update() each frame and destroy() when done. */
  animation: AnimatedWebp | null;
}

export interface LoadImageOptions {
  /** Trims transparent margins of animated WebP files. */
  trim: boolean;
}

/**
 * Loads PNG, JPG, and WEBP images. Animated WebP files are played frame by frame.
 * A still image is decoded once and reused, so opening a scene does not fetch it again.
 * Each animation gets its own decoder. One prepared at boot can be handed to the first scene.
 */
export class AssetLoader {
  private readonly stills = new Map<string, Texture>();
  private readonly prepared = new Map<string, LoadedImage>();
  private readonly kinds = new Map<string, 'animated' | 'still'>();
  private readonly stillBytes = new Map<string, ArrayBuffer>();

  /** Decodes an image ahead of the first scene that needs it. */
  async preload(url: string, trim: boolean): Promise<void> {
    const image = await this.loadImage(url, { trim });
    if (image?.animation) {
      this.prepared.set(preparedKey(url, trim), image);
    }
  }

  async loadImage(url: string, options: LoadImageOptions): Promise<LoadedImage | null> {
    const still = this.stills.get(url);
    if (still) {
      return { texture: still, animation: null };
    }

    const key = preparedKey(url, options.trim);
    const ready = this.prepared.get(key);
    if (ready) {
      this.prepared.delete(key);
      return ready;
    }

    if (await this.isAnimated(url)) {
      const animation = await AnimatedWebp.load(url, { trim: options.trim });
      if (animation) {
        return { texture: animation.texture, animation };
      }
    }

    return this.loadStill(url);
  }

  /**
   * Still WebP files are not sent through the animation decoder.
   * That decoder reads the whole file and throws the pixels away.
   */
  private async isAnimated(url: string): Promise<boolean> {
    const known = this.kinds.get(url);
    if (known) {
      return known === 'animated';
    }
    if (!isWebp(url)) {
      this.kinds.set(url, 'still');
      return false;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.kinds.set(url, 'still');
        return false;
      }
      const bytes = await response.arrayBuffer();
      const animated = webpIsAnimated(bytes);
      this.kinds.set(url, animated ? 'animated' : 'still');
      if (!animated) {
        this.stillBytes.set(url, bytes);
      }
      return animated;
    } catch {
      this.kinds.set(url, 'still');
      return false;
    }
  }

  private async loadStill(url: string): Promise<LoadedImage | null> {
    const bytes = this.stillBytes.get(url);
    this.stillBytes.delete(url);
    try {
      const texture = bytes ? await textureFromBytes(bytes, url) : await Assets.load<Texture>(url);
      this.stills.set(url, texture);
      return { texture, animation: null };
    } catch (error) {
      console.warn(`Could not load ${url}`, error);
      return null;
    }
  }
}

function preparedKey(url: string, trim: boolean): string {
  return `${trim ? '1' : '0'}:${url}`;
}

async function textureFromBytes(bytes: ArrayBuffer, url: string): Promise<Texture> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType(url) }));
  return Texture.from(bitmap);
}

function mimeType(url: string): string {
  const path = new URL(url, window.location.href).pathname.toLowerCase();
  if (path.endsWith('.png')) {
    return 'image/png';
  }
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (path.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'image/webp';
}

function isWebp(url: string): boolean {
  return new URL(url, window.location.href).pathname.toLowerCase().endsWith('.webp');
}
