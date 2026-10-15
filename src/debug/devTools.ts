import type GUI from 'lil-gui';
import type { Game } from '../core/Game';

/** True in local development, and after Settings → Dev mode in a published build. */
export const devTools = {
  enabled: import.meta.env.DEV,
};

let gui: GUI | null = null;
let dock: { show: () => void; hide: () => void } | null = null;
let mounting: Promise<void> | null = null;

/** Loads the debug panel and the scene dock once, then shows or hides them. */
export async function setDevToolsEnabled(game: Game, enabled: boolean): Promise<void> {
  devTools.enabled = enabled;
  if (!enabled) {
    gui?.hide();
    dock?.hide();
    return;
  }

  await mountDevTools(game);
  gui?.show();
  dock?.show();
}

export async function mountDevTools(game: Game): Promise<void> {
  if (gui && dock) {
    return;
  }
  if (mounting) {
    await mounting;
    return;
  }

  mounting = loadDevTools(game);
  try {
    await mounting;
  } finally {
    mounting = null;
  }
}

async function loadDevTools(game: Game): Promise<void> {
  const { createDebugPanel } = await import('./DebugPanel');
  const { createSceneDock } = await import('../editor/SceneDock');
  const { showContentProblems } = await import('./ContentProblemsOverlay');
  gui = createDebugPanel(game);
  dock = createSceneDock(game);
  showContentProblems(game.content.problems);
}
