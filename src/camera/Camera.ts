import type { Container } from 'pixi.js';
import { CAMERA_CONFIG, type CameraConfig } from './CameraConfig';
import { CameraHeadbob } from './CameraHeadbob';
import { CameraShake } from './CameraShake';

/**
 * Moves a world container.
 * Screen-space UI must live outside that container.
 *
 * final position = base + smoothed mouse offset + shake + headbob
 */
export class Camera {
  private readonly cameraShake = new CameraShake();
  private readonly headbob = new CameraHeadbob();
  private readonly config: CameraConfig;

  private baseX = 0;
  private baseY = 0;
  private mouseOffsetX = 0;
  private mouseOffsetY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;

  private pointerX = 0;
  private pointerY = 0;
  private viewWidth = 1;
  private viewHeight = 1;
  private hasPointer = false;
  private suppressLook = false;
  private locked = false;
  private zoom = 1;
  private targetZoom = 1;

  constructor(
    private readonly world: Container,
    config: CameraConfig = CAMERA_CONFIG,
  ) {
    this.config = config;
  }

  setBase(x: number, y: number): void {
    this.baseX = x;
    this.baseY = y;
  }

  setViewport(width: number, height: number): void {
    this.viewWidth = Math.max(width, 1);
    this.viewHeight = Math.max(height, 1);
    if (this.hasPointer && !this.suppressLook) {
      this.updateTarget();
    }
  }

  setPointer(x: number, y: number): void {
    const dx = x - this.pointerX;
    const dy = y - this.pointerY;
    this.pointerX = x;
    this.pointerY = y;

    if (this.locked) {
      return;
    }

    if (this.suppressLook) {
      if (this.hasPointer && Math.hypot(dx, dy) < 2) {
        return;
      }
      this.suppressLook = false;
    }

    this.hasPointer = true;
    this.updateTarget();
  }

  shake(intensity: number, durationMs: number): void {
    this.cameraShake.shake(intensity, durationMs);
  }

  /** Slowly pushes the scene in while a trigger dialogue is playing. */
  setZoomed(zoomed: boolean): void {
    this.targetZoom = zoomed ? Math.max(1, this.config.dialogueZoom) : 1;
  }

  /** Menus use this so buttons do not slide under the pointer. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked) {
      return;
    }
    this.targetMouseX = 0;
    this.targetMouseY = 0;
    this.mouseOffsetX = 0;
    this.mouseOffsetY = 0;
    this.cameraShake.stop();
    this.world.position.set(-this.baseX, -this.baseY);
  }

  /** Clears shake and returns the look offset to center until the mouse moves. */
  reset(): void {
    this.targetMouseX = 0;
    this.targetMouseY = 0;
    this.mouseOffsetX = 0;
    this.mouseOffsetY = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.suppressLook = true;
    this.cameraShake.stop();
    this.apply();
  }

  update(deltaMS: number): void {
    if (this.locked) {
      this.world.scale.set(1);
      this.world.position.set(-this.baseX, -this.baseY);
      return;
    }

    const smoothing = clamp(this.config.smoothing, 0, 1);
    const frames = deltaMS / (1000 / 60);
    const blend = 1 - Math.pow(1 - smoothing, frames);
    const zoomSmoothing = clamp(this.config.zoomSmoothing, 0.001, 1);
    const zoomBlend = 1 - Math.pow(1 - zoomSmoothing, frames);

    this.mouseOffsetX += (this.targetMouseX - this.mouseOffsetX) * blend;
    this.mouseOffsetY += (this.targetMouseY - this.mouseOffsetY) * blend;
    this.zoom += (this.targetZoom - this.zoom) * zoomBlend;
    if (Math.abs(this.targetZoom - this.zoom) < 0.0005) {
      this.zoom = this.targetZoom;
    }
    this.cameraShake.update(deltaMS, this.config.shakeDecay);
    this.headbob.update(
      deltaMS,
      this.config.headbobX,
      this.config.headbobY,
      this.config.headbobPeriod,
    );
    this.apply();
  }

  private updateTarget(): void {
    const influenceY = edgeInfluence(this.pointerY / this.viewHeight, this.config.edgeZone);
    this.targetMouseX = 0;
    this.targetMouseY = influenceY * this.config.maxOffsetY;
  }

  private apply(): void {
    const x = this.baseX + this.mouseOffsetX + this.cameraShake.offsetX + this.headbob.offsetX;
    const y = this.baseY + this.mouseOffsetY + this.cameraShake.offsetY + this.headbob.offsetY;
    const zoomX = (this.viewWidth * (1 - this.zoom)) / 2;
    const zoomY = (this.viewHeight * (1 - this.zoom)) / 2;
    this.world.scale.set(this.zoom);
    this.world.position.set(zoomX - x * this.zoom, zoomY - y * this.zoom);
  }
}

function edgeInfluence(position: number, edgeZone: number): number {
  const t = clamp(position, 0, 1);
  const zone = clamp(edgeZone, 0.001, 0.5);
  if (t <= zone) {
    return t / zone - 1;
  }
  if (t >= 1 - zone) {
    return (t - (1 - zone)) / zone;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
