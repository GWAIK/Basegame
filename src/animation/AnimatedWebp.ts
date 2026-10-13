import { CanvasSource, Texture } from 'pixi.js';

export interface AnimatedWebpOptions {
  /** Crops transparent margins. Defaults to true. false keeps the full canvas. */
  trim?: boolean;
}

const TRIM_SAMPLES = 12;
const TRIM_SAMPLE_WIDTH = 256;
const TRIM_PADDING = 0.03;
const DEFAULT_FRAME_MS = 100;

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Plays an animated WebP in a loop through one canvas texture.
 * Frames are decoded one ahead with ImageDecoder, so memory does not grow with frame count.
 * Transparent margins are trimmed, so only the visible area is uploaded each frame.
 */
export class AnimatedWebp {
  readonly texture: Texture;

  private readonly context: CanvasRenderingContext2D;
  private frameIndex = 0;
  private elapsed = 0;
  private frameDuration = DEFAULT_FRAME_MS;
  private nextFrame: VideoFrame | null = null;
  private decoding = false;
  private destroyed = false;

  private constructor(
    private readonly decoder: ImageDecoder,
    private readonly frameCount: number,
    private readonly area: Area,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = area.width;
    canvas.height = area.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D canvas is not available');
    }
    this.context = context;
    this.texture = new Texture({ source: new CanvasSource({ resource: canvas }) });
  }

  /**
   * Returns null when the browser lacks ImageDecoder, the file is missing,
   * or the WebP has a single frame. Callers can then load it as a still image.
   */
  static async load(url: string, options?: AnimatedWebpOptions): Promise<AnimatedWebp | null> {
    if (typeof ImageDecoder === 'undefined') {
      return null;
    }

    let decoder: ImageDecoder | null = null;
    try {
      const response = await fetch(url);
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !response.body || type.includes('text/html')) {
        return null;
      }

      decoder = new ImageDecoder({ data: response.body, type: 'image/webp' });
      await decoder.tracks.ready;
      await decoder.completed;

      const track = decoder.tracks.selectedTrack;
      if (!track || !track.animated || track.frameCount < 2) {
        decoder.close();
        return null;
      }

      const area = options?.trim === false
        ? await fullCanvasArea(decoder)
        : await findVisibleArea(decoder, track.frameCount);
      const animation = new AnimatedWebp(decoder, track.frameCount, area);
      await animation.showFirstFrame();
      return animation;
    } catch {
      decoder?.close();
      return null;
    }
  }

  update(deltaMS: number): void {
    if (this.destroyed) {
      return;
    }

    this.elapsed += deltaMS;
    if (this.elapsed < this.frameDuration) {
      return;
    }

    const frame = this.nextFrame;
    if (!frame) {
      this.decodeNext();
      return;
    }

    this.elapsed = Math.min(this.elapsed - this.frameDuration, this.frameDuration);
    this.nextFrame = null;
    this.draw(frame);
    this.decodeNext();
  }

  destroy(): void {
    this.destroyed = true;
    this.nextFrame?.close();
    this.nextFrame = null;
    this.decoder.close();
    this.texture.destroy(true);
  }

  private async showFirstFrame(): Promise<void> {
    const result = await this.decoder.decode({ frameIndex: 0 });
    this.draw(result.image);
    this.decodeNext();
  }

  private draw(frame: VideoFrame): void {
    this.context.clearRect(0, 0, this.area.width, this.area.height);
    this.context.drawImage(frame, -this.area.x, -this.area.y);
    this.frameDuration = frame.duration ? frame.duration / 1000 : DEFAULT_FRAME_MS;
    frame.close();
    this.texture.source.update();
  }

  private decodeNext(): void {
    if (this.decoding || this.destroyed) {
      return;
    }

    this.decoding = true;
    this.frameIndex = (this.frameIndex + 1) % this.frameCount;
    this.decoder.decode({ frameIndex: this.frameIndex }).then(
      (result) => {
        this.decoding = false;
        if (this.destroyed) {
          result.image.close();
          return;
        }
        this.nextFrame = result.image;
      },
      () => {
        this.decoding = false;
      },
    );
  }
}

async function fullCanvasArea(decoder: ImageDecoder): Promise<Area> {
  const first = await decoder.decode({ frameIndex: 0 });
  const area = {
    x: 0,
    y: 0,
    width: first.image.displayWidth,
    height: first.image.displayHeight,
  };
  first.image.close();
  return area;
}

/** Union of non-transparent pixels over evenly spaced frames, with a margin for frames in between. */
async function findVisibleArea(decoder: ImageDecoder, frameCount: number): Promise<Area> {
  const first = await decoder.decode({ frameIndex: 0 });
  const width = first.image.displayWidth;
  const height = first.image.displayHeight;
  first.image.close();

  const full: Area = { x: 0, y: 0, width, height };
  const scale = Math.min(1, TRIM_SAMPLE_WIDTH / width);
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return full;
  }

  let minX = sampleWidth;
  let minY = sampleHeight;
  let maxX = -1;
  let maxY = -1;
  const samples = Math.min(frameCount, TRIM_SAMPLES);

  for (let sample = 0; sample < samples; sample++) {
    const frameIndex = Math.floor((sample * frameCount) / samples);
    const result = await decoder.decode({ frameIndex });
    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(result.image, 0, 0, sampleWidth, sampleHeight);
    result.image.close();

    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        if (pixels[(y * sampleWidth + x) * 4 + 3] === 0) {
          continue;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return full;
  }

  const padX = Math.ceil(width * TRIM_PADDING);
  const padY = Math.ceil(height * TRIM_PADDING);
  const left = Math.max(0, Math.floor(minX / scale) - padX);
  const top = Math.max(0, Math.floor(minY / scale) - padY);
  const right = Math.min(width, Math.ceil((maxX + 1) / scale) + padX);
  const bottom = Math.min(height, Math.ceil((maxY + 1) / scale) + padY);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
