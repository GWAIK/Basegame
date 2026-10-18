/**
 * Live values for the level clock inside the frame.
 * right and top are pixels from the top-right corner of the square frame.
 */
export const TIMER_CONFIG = {
  size: 57,
  top: 36,
  right: 41,
  color: '#f4f1ea',
};

/** Red digits when a level runs the clock down in a hurry. */
export const TIMER_DRAIN_COLOR = '#e10600';
/** Milliseconds per shown second during that rush. */
export const TIMER_DRAIN_STEP_MS = 90;
