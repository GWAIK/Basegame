import GUI, { type Controller } from 'lil-gui';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import type { Game } from '../core/Game';

/**
 * Floating debug panel. Only created in development.
 * Levels, scenes, and dialogues are read from content/, so new content shows up here by itself.
 * Press H to hide or show it.
 */
export function createDebugPanel(game: Game): GUI {
  const gui = new GUI({ title: 'Debug' });
  gui.domElement.style.zIndex = '10';

  addNavigation(gui, game);
  addDialogues(gui, game);
  addEvents(gui, game);
  addCamera(gui, game);
  bindToggle(gui);

  return gui;
}

function addNavigation(gui: GUI, game: Game): void {
  const folder = gui.addFolder('Location');
  const levelChoices: Record<string, string> = {};
  for (const level of game.content.levels) {
    levelChoices[level.name] = level.id;
  }

  const state = {
    level: game.location?.levelId ?? game.content.firstLevel?.id ?? '',
    scene: game.location?.sceneId ?? '',
  };

  const levelController = folder.add(state, 'level', levelChoices).name('Level');
  levelController.onChange((levelId: string) => {
    void game.goTo(levelId);
    blurFocus();
  });

  let sceneController: Controller | null = null;
  const rebuildScenes = () => {
    sceneController?.destroy();
    const level = game.content.level(state.level);
    const sceneChoices: Record<string, string> = {};
    for (const scene of level?.scenes ?? []) {
      sceneChoices[scene.name] = scene.id;
    }
    sceneController = folder.add(state, 'scene', sceneChoices).name('Scene');
    sceneController.onChange((sceneId: string) => {
      void game.goTo(state.level, sceneId);
      blurFocus();
    });
  };
  rebuildScenes();

  game.events.on('scene:enter', ({ levelId, sceneId }) => {
    const levelChanged = state.level !== levelId;
    state.level = levelId;
    state.scene = sceneId;
    levelController.updateDisplay();
    if (levelChanged) {
      rebuildScenes();
    } else {
      sceneController?.updateDisplay();
    }
  });
}

function addDialogues(gui: GUI, game: Game): void {
  const folder = gui.addFolder('Dialogues');
  for (const id of game.content.dialogues.keys()) {
    folder.add({ play: () => run(() => game.playDialogue(id)) }, 'play').name(id);
  }
}

/** One-off triggers. Add a line here to test a new feature by hand. */
function addEvents(gui: GUI, game: Game): void {
  const folder = gui.addFolder('Events');
  folder.add({ run: () => run(() => game.shakeCamera()) }, 'run').name('Camera shake');
}

function addCamera(gui: GUI, game: Game): void {
  const folder = gui.addFolder('Camera');
  folder.add(CAMERA_CONFIG, 'maxOffsetX', 0, 120, 1).name('Offset X');
  folder.add(CAMERA_CONFIG, 'maxOffsetY', 0, 80, 1).name('Offset Y');
  folder.add(CAMERA_CONFIG, 'edgeZone', 0.05, 0.5, 0.01).name('Edge zone');
  folder.add(CAMERA_CONFIG, 'smoothing', 0.01, 0.3, 0.01).name('Smoothing');
  folder.add(CAMERA_CONFIG, 'headbobX', 0, 12, 0.1).name('Headbob X');
  folder.add(CAMERA_CONFIG, 'headbobY', 0, 12, 0.1).name('Headbob Y');
  folder.add(CAMERA_CONFIG, 'headbobPeriod', 800, 8000, 50).name('Headbob period');
  folder.add({ run: () => run(() => game.resetCamera()) }, 'run').name('Reset camera');
}

function bindToggle(gui: GUI): void {
  let visible = true;
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.code !== 'KeyH') {
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    visible = !visible;
    if (visible) {
      gui.show();
    } else {
      gui.hide();
    }
  });
}

function run(action: () => void): void {
  action();
  blurFocus();
}

/** Keeps Space and Enter for the game after a panel button is clicked. */
function blurFocus(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
