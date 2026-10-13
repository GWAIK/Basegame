import './style.css';
import { CAMERA_CONFIG } from './camera/CameraConfig';
import { Game } from './core/Game';
import { LEVEL_1 } from './levels/level1';

const host = document.querySelector('#app');
if (!(host instanceof HTMLElement)) {
  throw new Error('Missing #app element');
}

const game = new Game();
await game.start(host);

if (import.meta.env.DEV) {
  const { createDebugPanel } = await import('./debug/DebugPanel');
  createDebugPanel({
    levels: [{ id: LEVEL_1.id, label: 'Level 1' }],
    currentLevelId: LEVEL_1.id,
    onSelectLevel: (levelId) => game.goToLevel(levelId),
    scenes: LEVEL_1.scenes.map((scene) => ({ id: scene.id, label: scene.label })),
    currentSceneId: LEVEL_1.defaultSceneId,
    onSelectScene: (sceneId) => game.goToScene(sceneId),
    events: [
      { label: 'Start dialogue', run: () => game.startDialogue() },
      { label: 'Camera shake', run: () => game.shakeCamera() },
    ],
    camera: CAMERA_CONFIG,
    onResetCamera: () => game.resetCamera(),
  });
}
