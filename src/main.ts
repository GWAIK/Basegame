import './style.css';
import { ContentLibrary } from './content/ContentLibrary';
import { Game } from './core/Game';
import { devTools, mountDevTools } from './debug/devTools';

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

if (devTools.enabled) {
  await mountDevTools(game);
}
