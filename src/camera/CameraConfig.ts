export interface CameraConfig {
  maxOffsetX: number;
  maxOffsetY: number;
  /** Outer fraction of each screen edge that moves the camera. */
  edgeZone: number;
  /** Per-frame blend at 60fps. Higher values follow the mouse faster. */
  smoothing: number;
  /** Exponent applied to remaining shake. 1 is linear. */
  shakeDecay: number;
  /** Idle sway, in pixels. */
  headbobX: number;
  headbobY: number;
  /** Milliseconds for one vertical bob. Horizontal sway takes twice as long. */
  headbobPeriod: number;
}

export const CAMERA_CONFIG: CameraConfig = {
  maxOffsetX: 40,
  maxOffsetY: 25,
  edgeZone: 0.2,
  smoothing: 0.05,
  shakeDecay: 1,
  headbobX: 1.5,
  headbobY: 3,
  headbobPeriod: 3600,
};
