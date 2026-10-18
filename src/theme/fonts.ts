/**
 * Centralized typography for the whole game.
 * Loaded from Google Fonts in index.html, with rounded cozy fallbacks.
 */
export const GAME_FONTS = {
  /** Cozy rounded UI and body font. */
  cozy: '"Quicksand", "Nunito", "Varela Round", system-ui, sans-serif',
  /** Rounded display font for speaker badges and headers. */
  display: '"Fredoka", "Quicksand", "Nunito", system-ui, sans-serif',
  /** Soft rounded monospace for Pomodoro timers and choice prompts. */
  mono: '"JetBrains Mono", "Quicksand", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

/** Waits briefly for web fonts so PixiJS Canvas text renders with the loaded font. */
export async function readyGameFonts(): Promise<void> {
  if (!('fonts' in document)) {
    return;
  }
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('600 24px "Quicksand"'),
        document.fonts.load('700 32px "Fredoka"'),
        document.fonts.load('500 48px "JetBrains Mono"'),
      ]),
      new Promise((resolve) => window.setTimeout(resolve, 1200)),
    ]);
  } catch {
    // Offline or blocked font host falls back to system fonts cleanly.
  }
}
