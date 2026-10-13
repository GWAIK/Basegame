import { Assets, type Texture } from 'pixi.js';
import { AnimatedWebp } from '../animation/AnimatedWebp';

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
 * Still textures are cached by PixiJS. Each animation gets its own decoder.
 */
export class AssetLoader {
  async loadImage(url: string, options: LoadImageOptions): Promise<LoadedImage | null> {
    if (isWebp(url)) {
      const animation = await AnimatedWebp.load(url, { trim: options.trim });
      if (animation) {
        return { texture: animation.texture, animation };
      }
    }

    try {
      const texture = await Assets.load<Texture>(url);
      return { texture, animation: null };
    } catch (error) {
      console.warn(`Could not load ${url}`, error);
      return null;
    }
  }
}

function isWebp(url: string): boolean {
  return new URL(url, window.location.href).pathname.toLowerCase().endsWith('.webp');
}
