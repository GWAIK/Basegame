const SAMPLE_INTERVAL_MS = 50;

/**
 * Short-lived random offset added on top of the camera.
 * Offsets are reused fields, so the update loop does not allocate.
 */
export class CameraShake {
  offsetX = 0;
  offsetY = 0;

  private active = false;
  private intensity = 0;
  private duration = 1;
  private elapsed = 0;
  private sampleWait = 0;
  private targetX = 0;
  private targetY = 0;

  shake(intensity: number, durationMs: number): void {
    this.intensity = intensity;
    this.duration = Math.max(durationMs, 1);
    this.elapsed = 0;
    this.sampleWait = 0;
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.elapsed = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.targetX = 0;
    this.targetY = 0;
  }

  update(deltaMS: number, decayPower: number): void {
    if (!this.active) {
      return;
    }

    this.elapsed += deltaMS;
    if (this.elapsed >= this.duration) {
      this.stop();
      return;
    }

    const remaining = 1 - this.elapsed / this.duration;
    const amplitude = this.intensity * Math.pow(remaining, decayPower);

    this.sampleWait -= deltaMS;
    if (this.sampleWait <= 0) {
      const angle = Math.random() * Math.PI * 2;
      this.targetX = Math.cos(angle) * amplitude;
      this.targetY = Math.sin(angle) * amplitude;
      this.sampleWait = SAMPLE_INTERVAL_MS;
    } else {
      this.scaleTarget(amplitude);
    }

    const blend = Math.min(1, deltaMS / SAMPLE_INTERVAL_MS);
    this.offsetX += (this.targetX - this.offsetX) * blend;
    this.offsetY += (this.targetY - this.offsetY) * blend;
  }

  private scaleTarget(amplitude: number): void {
    const length = Math.hypot(this.targetX, this.targetY);
    if (length < 0.001) {
      return;
    }
    const scale = amplitude / length;
    this.targetX *= scale;
    this.targetY *= scale;
  }
}
