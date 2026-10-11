import './style.css';
import { Game } from './core/Game';
import { bindDebugPanel } from './debug/DebugPanel';

const host = document.querySelector('#app');
if (!(host instanceof HTMLElement)) {
  throw new Error('Missing #app element');
}

const game = new Game();
await game.start(host);

bindDebugPanel({
  onStartDialogue: () => game.startDialogue(),
  onShake: () => game.shakeCamera(),
  onResetCamera: () => game.resetCamera(),
});
