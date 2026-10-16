/**
 * Live values for the pause screen. The debug panel writes these.
 * x and y are centers on the same 1920×1080 board as the main menu.
 */
export const PAUSE_CONFIG = {
  blur: 8,
  buttonWidth: 460,
  buttonHeight: 72,
  x: 960,
  resumeY: 560,
  settingsY: 660,
  menuY: 760,
};

/** KeyboardEvent.code values. The debug panel overwrites these while listening. */
export const PAUSE_KEYS = {
  primary: 'KeyP',
  secondary: 'Escape',
  listening: null as 'primary' | 'secondary' | null,
};

export const PAUSE_BOARD_WIDTH = 1920;
export const PAUSE_BOARD_HEIGHT = 1080;

export function isPauseKey(code: string): boolean {
  return code === PAUSE_KEYS.primary || code === PAUSE_KEYS.secondary;
}
