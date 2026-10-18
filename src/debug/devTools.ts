import type { Game } from '../core/Game';

/** Off at boot. Shift+F6 toggles the editor. */
export const devTools = {
  enabled: false,
};

let editor: { show: () => void; hide: () => void } | null = null;
let mounting: Promise<void> | null = null;

/** Loads the editor once, then shows or hides it. */
export async function setDevToolsEnabled(game: Game, enabled: boolean): Promise<void> {
  devTools.enabled = enabled;
  if (!enabled) {
    editor?.hide();
    return;
  }

  await mountDevTools(game);
  editor?.show();
}

export async function mountDevTools(game: Game): Promise<void> {
  if (editor) {
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
  const { createSceneDock } = await import('../editor/SceneDock');
  const { showContentProblems } = await import('./ContentProblemsOverlay');
  editor = createSceneDock(game);
  if (!devTools.enabled) {
    editor.hide();
  }
  showContentProblems(game.content.problems);
}
