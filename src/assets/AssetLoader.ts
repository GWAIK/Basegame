import { Assets, type Texture } from 'pixi.js';

/**
 * Thin wrapper around PixiJS Assets.
 * A missing file returns null so scenes can draw a placeholder.
 */
export class AssetLoader {
  private readonly textures = new Map<string, Texture>();

  async load(alias: string, url: string): Promise<Texture | null> {
    const cached = this.textures.get(alias);
    if (cached) {
      return cached;
    }

    if (!(await this.canLoad(url))) {
      return null;
    }

    try {
      const texture = await Assets.load<Texture>(url);
      this.textures.set(alias, texture);
      return texture;
    } catch {
      return null;
    }
  }

  get(alias: string): Texture | null {
    return this.textures.get(alias) ?? null;
  }

  private async canLoad(url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return false;
      }
      const type = response.headers.get('content-type') ?? '';
      return !type.includes('text/html');
    } catch {
      return false;
    }
  }
}
