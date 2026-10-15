import GUI, { type Controller } from 'lil-gui';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import type { Game } from '../core/Game';
import { onTriggerSelection, triggerDebug, triggerSnippet } from './triggerDebug';

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
  addTriggers(gui);
  addAudio(gui, game);
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
  let shownLevel = state.level;
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
    state.level = levelId;
    state.scene = sceneId;
    levelController.updateDisplay();
    if (shownLevel !== levelId) {
      shownLevel = levelId;
      rebuildScenes();
      return;
    }
    sceneController?.updateDisplay();
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

function addTriggers(gui: GUI): void {
  const folder = gui.addFolder('Triggers');
  folder.add(triggerDebug, 'visible').name('Show boxes');

  const state = { values: 'Click a box', copy: () => undefined };
  const values = folder.add(state, 'values').name('Values');
  const copy = folder.add(state, 'copy').name('Copy values');
  copy.onChange(() => {
    const snippet = triggerSnippet(triggerDebug.selected);
    if (!snippet) {
      return;
    }
    const input = values.domElement.querySelector('input');
    void navigator.clipboard.writeText(snippet).then(
      () => {
        copy.name('Copied');
        window.setTimeout(() => copy.name('Copy values'), 1200);
      },
      () => {
        input?.focus();
        input?.select();
        copy.name('Select the line');
        window.setTimeout(() => copy.name('Copy values'), 1600);
      },
    );
  });

  const refresh = () => {
    const snippet = triggerSnippet(triggerDebug.selected);
    state.values = snippet || 'Click a box';
    values.updateDisplay();
  };
  onTriggerSelection(refresh);
  folder.open();
}

function addAudio(gui: GUI, game: Game): void {
  const folder = gui.addFolder('Audio');
  const state = { volume: 1 };
  folder.add(state, 'volume', 0, 1, 0.01).name('Master').onChange((volume: number) => {
    game.setMasterVolume(volume);
  });
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
