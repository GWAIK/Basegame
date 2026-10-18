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
  /** Scale while a trigger dialogue is open. 1 is no zoom. */
  dialogueZoom: number;
  /** Per-frame zoom blend at 60fps. */
  zoomSmoothing: number;
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
  dialogueZoom: 1.07,
  zoomSmoothing: 0.03,
};
