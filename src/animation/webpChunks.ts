/**
 * Plays an animated WebP without ImageDecoder (Safari, as of 2026).
 * Each frame is decoded as a still WebP, which every current browser can do,
 * then composited with the file's blend and dispose rules.
 */

const TRIM_SAMPLES = 12;
const TRIM_SAMPLE_WIDTH = 256;
const TRIM_PADDING = 0.03;
const DEFAULT_FRAME_MS = 100;

export interface FrameArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawnFrame {
  image: CanvasImageSource;
  durationMs: number;
  close(): void;
}

export interface FrameDecoder {
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  decode(frameIndex: number): Promise<DrawnFrame>;
  visibleArea(): Promise<FrameArea>;
  close(): void;
}

interface WebpFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
  /** False overwrites the rectangle. True blends over the previous canvas. */
  blend: boolean;
  /** True clears the rectangle to the background color once the frame has been shown. */
  dispose: boolean;
  data: Uint8Array;
}

/** True when the file has an animation chunk. A still WebP returns false. */
export function webpIsAnimated(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || tagAt(bytes, 0) !== 'RIFF' || tagAt(bytes, 8) !== 'WEBP') {
    return false;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const tag = tagAt(bytes, offset);
    const size = readU32(bytes, offset + 4);
    if (tag === 'ANIM' || tag === 'ANMF') {
      return true;
    }
    const end = offset + 8 + size;
    if (end > bytes.length) {
      break;
    }
    offset = end + (size & 1);
  }
  return false;
}

/** Returns null when the file is missing frames or is a still image. */
export function openChunkDecoder(buffer: ArrayBuffer): FrameDecoder | null {
  const parsed = parseAnimatedWebp(buffer);
  if (!parsed) {
    return null;
  }
  return new ChunkDecoder(parsed.width, parsed.height, parsed.frames);
}

class ChunkDecoder implements FrameDecoder {
  readonly frameCount: number;

  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private composedIndex = -1;
  private disposePrevious = false;
  private previousRect: FrameArea = { x: 0, y: 0, width: 0, height: 0 };
  private closed = false;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly frames: readonly WebpFrame[],
  ) {
    this.frameCount = frames.length;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('2D canvas is not available');
    }
    this.context = context;
    this.reset();
  }

  async decode(frameIndex: number): Promise<DrawnFrame> {
    if (this.closed) {
      throw new Error('Animation decoder is closed');
    }
    const wrapped = this.composedIndex === this.frameCount - 1 && frameIndex === 0;
    if (this.composedIndex >= 0 && frameIndex <= this.composedIndex && !wrapped) {
      this.reset();
    }
    while (this.composedIndex !== frameIndex) {
      await this.step();
    }

    const snapshot = await createImageBitmap(this.canvas);
    return {
      image: snapshot,
      durationMs: this.frames[frameIndex].durationMs,
      close: () => snapshot.close(),
    };
  }

  /** One forward pass, so partial frames are sampled after they have been composited. */
  async visibleArea(): Promise<FrameArea> {
    const full = { x: 0, y: 0, width: this.width, height: this.height };
    this.reset();

    const scale = Math.min(1, TRIM_SAMPLE_WIDTH / this.width);
    const sampleWidth = Math.max(1, Math.round(this.width * scale));
    const sampleHeight = Math.max(1, Math.round(this.height * scale));
    const sample = document.createElement('canvas');
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) {
      this.reset();
      return full;
    }

    const sampleAt = new Set<number>();
    const samples = Math.min(this.frameCount, TRIM_SAMPLES);
    for (let index = 0; index < samples; index += 1) {
      sampleAt.add(Math.floor((index * this.frameCount) / samples));
    }

    let minX = sampleWidth;
    let minY = sampleHeight;
    let maxX = -1;
    let maxY = -1;

    for (let frame = 0; frame < this.frameCount; frame += 1) {
      await this.step();
      if (!sampleAt.has(frame)) {
        continue;
      }
      sampleContext.clearRect(0, 0, sampleWidth, sampleHeight);
      sampleContext.drawImage(this.canvas, 0, 0, sampleWidth, sampleHeight);
      const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
      for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
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

    this.reset();
    if (maxX < 0) {
      return full;
    }

    const padX = Math.ceil(this.width * TRIM_PADDING);
    const padY = Math.ceil(this.height * TRIM_PADDING);
    const left = Math.max(0, Math.floor(minX / scale) - padX);
    const top = Math.max(0, Math.floor(minY / scale) - padY);
    const right = Math.min(this.width, Math.ceil((maxX + 1) / scale) + padX);
    const bottom = Math.min(this.height, Math.ceil((maxY + 1) / scale) + padY);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  close(): void {
    this.closed = true;
  }

  private reset(): void {
    this.fill(0, 0, this.width, this.height);
    this.composedIndex = -1;
    this.disposePrevious = false;
  }

  private async step(): Promise<void> {
    const frame = this.frames[(this.composedIndex + 1) % this.frameCount];
    if (this.disposePrevious) {
      this.fill(this.previousRect.x, this.previousRect.y, this.previousRect.width, this.previousRect.height);
    }
    if (!frame.blend) {
      this.context.clearRect(frame.x, frame.y, frame.width, frame.height);
    }
    const bitmap = await createImageBitmap(stillWebp(frame));
    this.context.drawImage(bitmap, frame.x, frame.y);
    bitmap.close();
    this.disposePrevious = frame.dispose;
    this.previousRect = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    this.composedIndex = (this.composedIndex + 1) % this.frameCount;
  }

  /**
   * Empty areas stay transparent. ImageDecoder does the same, even when the
   * file names a background color, so the trimmed character matches.
   */
  private fill(x: number, y: number, width: number, height: number): void {
    this.context.clearRect(x, y, width, height);
  }
}

function parseAnimatedWebp(buffer: ArrayBuffer): {
  width: number;
  height: number;
  frames: WebpFrame[];
} | null {
  const bytes = new Uint8Array(buffer);
  if (tagAt(bytes, 0) !== 'RIFF' || tagAt(bytes, 8) !== 'WEBP') {
    return null;
  }

  let width = 0;
  let height = 0;
  const frames: WebpFrame[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const tag = tagAt(bytes, offset);
    const size = readU32(bytes, offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.length) {
      break;
    }

    if (tag === 'VP8X' && size >= 10) {
      width = 1 + readU24(bytes, start + 4);
      height = 1 + readU24(bytes, start + 7);
    } else if (tag === 'ANMF' && size >= 16) {
      const flags = bytes[start + 15];
      const duration = readU24(bytes, start + 12);
      frames.push({
        x: readU24(bytes, start) * 2,
        y: readU24(bytes, start + 3) * 2,
        width: 1 + readU24(bytes, start + 6),
        height: 1 + readU24(bytes, start + 9),
        durationMs: duration || DEFAULT_FRAME_MS,
        blend: (flags & 2) === 0,
        dispose: (flags & 1) !== 0,
        data: bytes.subarray(start + 16, end),
      });
    }

    offset = end + (size & 1);
  }

  if (frames.length < 2 || width < 1 || height < 1) {
    return null;
  }
  return { width, height, frames };
}

/**
 * A frame chunk is not a file on its own. Lossy frames with an alpha channel
 * need a VP8X header before a browser will decode them as a still WebP.
 */
function stillWebp(frame: WebpFrame): Blob {
  const payload = tagAt(frame.data, 0) === 'ALPH'
    ? concat(vp8xChunk(frame.width, frame.height), frame.data)
    : frame.data;
  const file = new Uint8Array(12 + payload.length);
  file.set(textBytes('RIFF'), 0);
  new DataView(file.buffer).setUint32(4, 4 + payload.length, true);
  file.set(textBytes('WEBP'), 8);
  file.set(payload, 12);
  return new Blob([file], { type: 'image/webp' });
}

function vp8xChunk(width: number, height: number): Uint8Array {
  const chunk = new Uint8Array(18);
  chunk.set(textBytes('VP8X'), 0);
  new DataView(chunk.buffer).setUint32(4, 10, true);
  chunk[8] = 0x10;
  writeU24(chunk, 12, width - 1);
  writeU24(chunk, 15, height - 1);
  return chunk;
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readU24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24);
}

function writeU24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 255;
  bytes[offset + 1] = (value >> 8) & 255;
  bytes[offset + 2] = (value >> 16) & 255;
}

function textBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}
