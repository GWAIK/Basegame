import './style.css';
import { ContentLibrary } from './content/ContentLibrary';
import { Game } from './core/Game';

const host = document.querySelector('#app');
if (!(host instanceof HTMLElement)) {
  throw new Error('Missing #app element');
}

const content = ContentLibrary.load();
for (const problem of content.problems) {
  console.warn(`[content] ${problem}`);
}

const game = new Game(content);
await game.start(host);

if (import.meta.env.DEV) {
  const { createDebugPanel } = await import('./debug/DebugPanel');
  const { showContentProblems } = await import('./debug/ContentProblemsOverlay');
  createDebugPanel(game);
  showContentProblems(content.problems);
}
