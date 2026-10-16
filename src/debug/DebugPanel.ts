import GUI, { type Controller } from 'lil-gui';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import type { Game } from '../core/Game';
import { PAUSE_CONFIG, PAUSE_KEYS } from '../pause/PauseConfig';
import { onTriggerSelection, triggerDebug, triggerSnippet } from './triggerDebug';

/**
 * Floating debug panel. Only created in development.
 * Levels, scenes, and Ink knots are read from content/, so new content shows up here by itself.
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
  addShortcuts(gui);
  addPause(gui);
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
  for (const id of game.content.knots) {
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

function addShortcuts(gui: GUI): void {
  const folder = gui.addFolder('Shortcuts');
  const primary = folder.add({ bind: () => arm('primary') }, 'bind');
  const secondary = folder.add({ bind: () => arm('secondary') }, 'bind');

  const refresh = () => {
    primary.name(slotName('primary'));
    secondary.name(slotName('secondary'));
  };
  const arm = (slot: 'primary' | 'secondary') => {
    PAUSE_KEYS.listening = slot;
    refresh();
  };
  refresh();

  window.addEventListener('keydown', (event) => {
    const slot = PAUSE_KEYS.listening;
    if (!slot || event.repeat || isModifier(event.code)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    PAUSE_KEYS[slot] = event.code;
    PAUSE_KEYS.listening = null;
    refresh();
    blurFocus();
  }, true);
}

function addPause(gui: GUI): void {
  const folder = gui.addFolder('Pause');
  folder.add(PAUSE_CONFIG, 'blur', 0, 32, 0.5).name('Blur');
  folder.add(PAUSE_CONFIG, 'buttonWidth', 80, 1400, 1).name('Width');
  folder.add(PAUSE_CONFIG, 'buttonHeight', 24, 280, 1).name('Height');
  folder.add(PAUSE_CONFIG, 'x', 0, 1920, 1).name('X');
  folder.add(PAUSE_CONFIG, 'resumeY', 0, 1080, 1).name('Resume Y');
  folder.add(PAUSE_CONFIG, 'settingsY', 0, 1080, 1).name('Settings Y');
  folder.add(PAUSE_CONFIG, 'menuY', 0, 1080, 1).name('Main menu Y');
}

function slotName(slot: 'primary' | 'secondary'): string {
  if (PAUSE_KEYS.listening === slot) {
    return 'Press a key';
  }
  return `Pause: ${keyLabel(PAUSE_KEYS[slot])}`;
}

function keyLabel(code: string): string {
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code === 'Escape') {
    return 'Esc';
  }
  return code;
}

function isModifier(code: string): boolean {
  return code.startsWith('Shift') || code.startsWith('Control') || code.startsWith('Alt') || code.startsWith('Meta');
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
