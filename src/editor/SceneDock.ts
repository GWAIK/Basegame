import type { SceneDef } from '../content/types';
import type { Game } from '../core/Game';
import {
  onSceneStructure,
  onSceneTransform,
  resetSceneEditor,
  sceneEditor,
  sceneItemKey,
  sceneSnippet,
  selectSceneItem,
  setSceneEditorOpen,
  toggleSceneItemHidden,
  type SceneSelection,
} from './sceneEditor';

/**
 * Lists the assets on the current scene and edits the selected one.
 * Dev only. It is not the debug panel: that one stays for navigation, audio, and camera.
 */
export function createSceneDock(game: Game): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'scene-toggle';
  toggle.textContent = 'Scene';
  toggle.addEventListener('click', () => setSceneEditorOpen(true));

  const dock = document.createElement('aside');
  dock.className = 'scene-dock';
  dock.hidden = true;

  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = 'Scene';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => setSceneEditorOpen(false));
  header.append(title, close);

  const list = document.createElement('div');
  list.className = 'scene-list';

  const inspector = document.createElement('div');
  inspector.className = 'scene-inspector';

  const hint = document.createElement('p');
  hint.className = 'scene-hint';
  hint.textContent = 'Drag on the scene to move. The eye hides an asset here only. Copy the values into level.json.';

  dock.append(header, list, inspector, hint);
  document.body.append(toggle, dock);

  const redraw = () => {
    const scene = currentScene(game);
    toggle.hidden = sceneEditor.open;
    dock.hidden = !sceneEditor.open;
    list.replaceChildren();
    inspector.replaceChildren();
    if (!scene) {
      return;
    }
    list.append(renderList(scene));
    inspector.append(renderInspector(scene));
  };

  onSceneStructure(redraw);
  onSceneTransform(() => refreshNumbers(inspector, currentScene(game)));
  game.events.on('scene:enter', () => resetSceneEditor());
  redraw();
}

function currentScene(game: Game): SceneDef | null {
  const location = game.location;
  if (!location) {
    return null;
  }
  const level = game.content.level(location.levelId);
  return level ? game.content.scene(level, location.sceneId) : null;
}

function renderList(scene: SceneDef): HTMLElement {
  const root = document.createElement('div');
  root.append(row(scene, { kind: 'background', index: 0 }, 'Background', fileName(scene.background ?? 'placeholder')));

  if (scene.characters.length > 0) {
    root.append(group('Characters'));
    scene.characters.forEach((character, index) => {
      root.append(row(scene, { kind: 'character', index }, 'Character', fileName(character.image)));
    });
  }
  if (scene.texts.length > 0) {
    root.append(group('Texts'));
    scene.texts.forEach((text, index) => {
      root.append(row(scene, { kind: 'text', index }, 'Text', text.text));
    });
  }
  if (scene.triggers.length > 0) {
    root.append(group('Triggers'));
    scene.triggers.forEach((trigger, index) => {
      root.append(row(scene, { kind: 'trigger', index }, 'Trigger', trigger.label ?? trigger.id));
    });
  }
  return root;
}

function group(label: string): HTMLElement {
  const heading = document.createElement('p');
  heading.className = 'scene-group';
  heading.textContent = label;
  return heading;
}

function row(scene: SceneDef, selection: SceneSelection, kind: string, label: string): HTMLElement {
  const key = keyOf(scene, selection);
  const selected = sceneEditor.selected?.kind === selection.kind && sceneEditor.selected.index === selection.index;
  const item = document.createElement('div');
  item.className = selected ? 'scene-row is-selected' : 'scene-row';

  const eye = document.createElement('button');
  eye.type = 'button';
  eye.className = 'scene-eye';
  const hidden = sceneEditor.hidden.has(key);
  eye.textContent = hidden ? 'Show' : 'Hide';
  eye.title = hidden ? 'Show on the scene' : 'Hide on the scene';
  eye.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSceneItemHidden(key);
  });

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'scene-name';
  name.textContent = label;
  name.title = `${kind}: ${label}`;
  name.addEventListener('click', () => selectSceneItem(selection));

  item.append(eye, name);
  return item;
}

function renderInspector(scene: SceneDef): HTMLElement {
  const root = document.createElement('div');
  const selection = sceneEditor.selected;
  if (!selection) {
    const empty = document.createElement('p');
    empty.className = 'scene-empty';
    empty.textContent = 'Select an asset';
    root.append(empty);
    return root;
  }

  const values = document.createElement('textarea');
  values.className = 'scene-values';
  values.readOnly = true;
  values.rows = 3;
  values.value = sceneSnippet(scene, selection);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'scene-copy';
  copy.textContent = 'Copy values';
  copy.addEventListener('click', () => {
    const snippet = sceneSnippet(scene, sceneEditor.selected);
    if (!snippet) {
      return;
    }
    values.value = snippet;
    void navigator.clipboard.writeText(snippet).then(
      () => flash(copy, 'Copied'),
      () => {
        values.focus();
        values.select();
        flash(copy, 'Select the line');
      },
    );
  });

  root.append(...numberFields(scene, selection), values, copy);
  return root;
}

function numberFields(scene: SceneDef, selection: SceneSelection): HTMLElement[] {
  if (selection.kind === 'background') {
    return [];
  }
  if (selection.kind === 'character') {
    const character = scene.characters[selection.index];
    if (!character) {
      return [];
    }
    return [
      numberField('x', character.x, 1, (value) => {
        character.x = value;
      }),
      numberField('y', character.y, 1, (value) => {
        character.y = value;
      }),
      numberField('scale', character.scale, 0.01, (value) => {
        character.scale = Math.max(0.05, value);
      }),
    ];
  }
  if (selection.kind === 'text') {
    const text = scene.texts[selection.index];
    if (!text) {
      return [];
    }
    return [
      numberField('x', text.x, 1, (value) => {
        text.x = value;
      }),
      numberField('y', text.y, 1, (value) => {
        text.y = value;
      }),
      numberField('size', text.size, 1, (value) => {
        text.size = Math.max(1, value);
      }),
    ];
  }
  const trigger = scene.triggers[selection.index];
  if (!trigger) {
    return [];
  }
  return [
    numberField('x', trigger.x, 1, (value) => {
      trigger.x = value;
    }),
    numberField('y', trigger.y, 1, (value) => {
      trigger.y = value;
    }),
    numberField('width', trigger.width, 1, (value) => {
      trigger.width = Math.max(32, value);
    }),
    numberField('height', trigger.height, 1, (value) => {
      trigger.height = Math.max(32, value);
    }),
  ];
}

function numberField(label: string, value: number, step: number, apply: (value: number) => void): HTMLElement {
  const field = document.createElement('label');
  field.className = 'scene-field';
  field.dataset.field = label;
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = String(roundForStep(value, step));
  input.addEventListener('input', () => {
    const next = Number(input.value);
    if (!Number.isFinite(next)) {
      return;
    }
    apply(next);
  });
  field.append(name, input);
  return field;
}

function refreshNumbers(inspector: HTMLElement, scene: SceneDef | null): void {
  const selection = sceneEditor.selected;
  if (!scene || !selection) {
    return;
  }
  const values = inspector.querySelector('.scene-values');
  if (
    (values instanceof HTMLInputElement || values instanceof HTMLTextAreaElement) &&
    document.activeElement !== values
  ) {
    values.value = sceneSnippet(scene, selection);
  }
  for (const field of inspector.querySelectorAll('.scene-field')) {
    if (!(field instanceof HTMLLabelElement)) {
      continue;
    }
    const input = field.querySelector('input');
    const key = field.dataset.field;
    if (!(input instanceof HTMLInputElement) || !key || document.activeElement === input) {
      continue;
    }
    const next = readField(scene, selection, key);
    if (next === null) {
      continue;
    }
    input.value = String(roundForStep(next, Number(input.step) || 1));
  }
}

function readField(scene: SceneDef, selection: SceneSelection, key: string): number | null {
  if (selection.kind === 'character') {
    const character = scene.characters[selection.index];
    if (!character || (key !== 'x' && key !== 'y' && key !== 'scale')) {
      return null;
    }
    return character[key];
  }
  if (selection.kind === 'text') {
    const text = scene.texts[selection.index];
    if (!text || (key !== 'x' && key !== 'y' && key !== 'size')) {
      return null;
    }
    return text[key];
  }
  if (selection.kind === 'trigger') {
    const trigger = scene.triggers[selection.index];
    if (!trigger || (key !== 'x' && key !== 'y' && key !== 'width' && key !== 'height')) {
      return null;
    }
    return trigger[key];
  }
  return null;
}

function keyOf(scene: SceneDef, selection: SceneSelection): string {
  const trigger = selection.kind === 'trigger' ? scene.triggers[selection.index] : undefined;
  return sceneItemKey(selection.kind, selection.index, trigger?.id);
}

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function roundForStep(value: number, step: number): number {
  if (step < 1) {
    return Math.round(value * 100) / 100;
  }
  return Math.round(value);
}

function flash(button: HTMLButtonElement, label: string): void {
  const previous = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}
