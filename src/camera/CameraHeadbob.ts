/**
 * Slow idle sway. Offsets are reused fields, so the update loop does not allocate.
 * Vertical motion is one cycle per period. Horizontal motion is half that speed.
 */
export class CameraHeadbob {
  offsetX = 0;
  offsetY = 0;

  private elapsed = 0;

  update(deltaMS: number, amplitudeX: number, amplitudeY: number, periodMs: number): void {
    const period = Math.max(periodMs, 1);
    const cycle = period * 2;
    this.elapsed = (this.elapsed + deltaMS) % cycle;

    const vertical = (this.elapsed / period) * Math.PI * 2;
    this.offsetX = Math.sin(vertical * 0.5) * amplitudeX;
    this.offsetY = Math.sin(vertical) * amplitudeY;
  }
}
