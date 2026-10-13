import GUI from 'lil-gui';
import type { CameraConfig } from '../camera/CameraConfig';

export interface DebugLevel {
  id: string;
  label: string;
}

/** Something the debug panel can trigger. Later: scene events, flags, timers. */
export interface DebugAction {
  label: string;
  run: () => void;
}

export interface DebugScene {
  id: string;
  label: string;
}

export interface DebugPanelOptions {
  levels: readonly DebugLevel[];
  currentLevelId: string;
  /** Called when the level dropdown changes. Scene switching is added here later. */
  onSelectLevel: (levelId: string) => void;
  scenes: readonly DebugScene[];
  currentSceneId: string;
  onSelectScene: (sceneId: string) => void;
  events: readonly DebugAction[];
  camera: CameraConfig;
  onResetCamera: () => void;
}

/**
 * Floating debug panel. Only created in development.
 * Press H to hide or show it. The panel is not part of the PixiJS scene.
 */
export function createDebugPanel(options: DebugPanelOptions): GUI {
  const gui = new GUI({ title: 'Debug' });
  gui.domElement.style.zIndex = '10';

  addLevels(gui, options);
  addScenes(gui, options);
  addEvents(gui, options.events);
  addCamera(gui, options.camera, options.onResetCamera);
  bindToggle(gui);

  return gui;
}

function addLevels(gui: GUI, options: DebugPanelOptions): void {
  const folder = gui.addFolder('Level');
  const choices: Record<string, string> = {};
  for (const level of options.levels) {
    choices[level.label] = level.id;
  }

  const state = { level: options.currentLevelId };
  folder.add(state, 'level', choices).name('Current').onChange((levelId: string) => {
    options.onSelectLevel(levelId);
  });
}

function addScenes(gui: GUI, options: DebugPanelOptions): void {
  const folder = gui.addFolder('Scene');
  const choices: Record<string, string> = {};
  for (const scene of options.scenes) {
    choices[scene.label] = scene.id;
  }

  const state = { scene: options.currentSceneId };
  folder.add(state, 'scene', choices).name('Current').onChange((sceneId: string) => {
    options.onSelectScene(sceneId);
  });
}

function addEvents(gui: GUI, events: readonly DebugAction[]): void {
  const folder = gui.addFolder('Events');
  for (const event of events) {
    const action = {
      run: () => {
        event.run();
        blurFocus();
      },
    };
    folder.add(action, 'run').name(event.label);
  }
}

function addCamera(gui: GUI, camera: CameraConfig, onResetCamera: () => void): void {
  const folder = gui.addFolder('Camera');
  folder.add(camera, 'maxOffsetX', 0, 120, 1).name('Offset X');
  folder.add(camera, 'maxOffsetY', 0, 80, 1).name('Offset Y');
  folder.add(camera, 'edgeZone', 0.05, 0.5, 0.01).name('Edge zone');
  folder.add(camera, 'smoothing', 0.01, 0.3, 0.01).name('Smoothing');
  folder.add(camera, 'headbobX', 0, 12, 0.1).name('Headbob X');
  folder.add(camera, 'headbobY', 0, 12, 0.1).name('Headbob Y');
  folder.add(camera, 'headbobPeriod', 800, 8000, 50).name('Headbob period');
  folder.add({
    run: () => {
      onResetCamera();
      blurFocus();
    },
  }, 'run').name('Reset camera');
}

function bindToggle(gui: GUI): void {
  let visible = true;
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.code !== 'KeyH') {
      return;
    }
    if (isTypingTarget(event.target)) {
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

function blurFocus(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
