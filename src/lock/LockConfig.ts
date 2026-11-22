import type { LockSounds } from './types';

/**
 * Sounds a lock plays when its level.json entry leaves them out.
 * Swap a file here to change every lock at once. A lock can still set its own.
 */
export const LOCK_DEFAULT_SOUNDS: LockSounds = {
  change: { file: '/shared/audio/lock-tick.wav', volume: 0.7 },
  solve: { file: '/shared/audio/lock-unlock.wav', volume: 0.9 },
  open: { file: '/shared/audio/click.wav', volume: 0.6 },
  close: { file: '/shared/audio/click.wav', volume: 0.5 },
};

/** Live values for the lock panel. Sizes are fractions of the panel width unless noted. */
export const LOCK_CONFIG = {
  /** Milliseconds the solved panel stays up before it closes by itself. */
  solveHoldMs: 1100,
  /** Milliseconds a wheel's value grows after it turns. */
  pulseMs: 150,
  /** Extra scale at the start of that pulse. */
  pulseScale: 0.22,
  /** Widest the panel gets, in screen pixels. */
  maxWidth: 640,
  /** Height of the panel against its width. */
  aspect: 0.66,
  /** Most wheels a lock can have. More would not fit the panel. */
  maxWheels: 6,
  hint: 'Click the arrows to turn each wheel.',
  solvedHint: 'Unlocked',
};
