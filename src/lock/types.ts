/** A sound the lock plays. file is a content path, volume goes from 0 to 1. */
export interface LockSoundCue {
  file: string;
  volume: number;
}

/** What the lock plays for each moment. Null stays silent. */
export interface LockSounds {
  /** A wheel moved to another value. */
  change: LockSoundCue | null;
  /** Every wheel shows the right value. */
  solve: LockSoundCue | null;
  /** The panel opened. */
  open: LockSoundCue | null;
  /** The player left before solving it. */
  close: LockSoundCue | null;
}

/**
 * One combination lock. Every wheel cycles through the same values.
 * The combination has one value per wheel, so its length is the wheel count.
 */
export interface LockDef {
  id: string;
  /** Line drawn at the top of the panel. */
  title: string;
  /** Values every wheel cycles through, in this order. */
  values: readonly string[];
  /** The value each wheel must show to open the lock. */
  combination: readonly string[];
  /** Values shown the first time the panel opens. Null starts every wheel on the first value. */
  start: readonly string[] | null;
  /** Backdrop image for the panel. Null draws a plain plate. */
  panel: string | null;
  sounds: LockSounds;
}
