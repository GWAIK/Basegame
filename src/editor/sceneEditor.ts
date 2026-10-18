import type { CharacterDef, SceneDef, TextDef, TriggerDef } from '../content/types';
import { triggerSnippet } from '../debug/triggerDebug';

export type SceneKind = 'background' | 'character' | 'text' | 'trigger';

export interface SceneSelection {
  kind: SceneKind;
  index: number;
}

type Listener = () => void;

const structureListeners = new Set<Listener>();
const transformListeners = new Set<Listener>();

/**
 * Dev-only scene view.
 * open turns on selection and dragging in the viewport. hidden is editor-only:
 * hiding the editor shows everything again, and a reload restores level.json.
 */
export const sceneEditor = {
  open: false,
  selected: null as SceneSelection | null,
  hidden: new Set<string>(),
};

export function sceneItemKey(kind: SceneKind, index: number, triggerId?: string): string {
  if (kind === 'background') {
    return 'background';
  }
  if (kind === 'trigger') {
    return `trigger:${triggerId ?? index}`;
  }
  return `${kind}:${index}`;
}

export function setSceneEditorOpen(open: boolean): void {
  sceneEditor.open = open;
  emitStructure();
}

export function selectSceneItem(selection: SceneSelection | null): void {
  sceneEditor.selected = selection;
  emitStructure();
}

export function toggleSceneItemHidden(key: string): void {
  if (sceneEditor.hidden.has(key)) {
    sceneEditor.hidden.delete(key);
  } else {
    sceneEditor.hidden.add(key);
  }
  emitStructure();
}

const DEFAULT_PLACE_X = 960;
const DEFAULT_PLACE_Y = 540;

export interface SceneDimensions {
  width: number;
  height: number;
}

function centerOf(size?: SceneDimensions | null): { x: number; y: number } {
  if (!size || size.width <= 0 || size.height <= 0) {
    return { x: DEFAULT_PLACE_X, y: DEFAULT_PLACE_Y };
  }
  return { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
}

/** Adds a trigger at the middle of the scene. The caller reloads the scene. */
export function placeTrigger(scene: SceneDef, size?: SceneDimensions | null): SceneSelection {
  const triggers = scene.triggers as TriggerDef[];
  const ids = new Set(triggers.map((trigger) => trigger.id));
  let n = triggers.length + 1;
  let id = `trigger-${n}`;
  while (ids.has(id)) {
    n += 1;
    id = `trigger-${n}`;
  }
  const center = centerOf(size);
  triggers.push({
    id,
    label: null,
    once: true,
    x: center.x,
    y: center.y,
    width: Math.min(280, Math.max(64, Math.round((size?.width ?? 1920) * 0.2))),
    height: Math.min(120, Math.max(48, Math.round((size?.height ?? 1080) * 0.1))),
    actions: [],
  });
  return { kind: 'trigger', index: triggers.length - 1 };
}

/** Adds a text at the middle of the scene. The caller reloads the scene. */
export function placeText(scene: SceneDef, size?: SceneDimensions | null): SceneSelection {
  const texts = scene.texts as TextDef[];
  const center = centerOf(size);
  texts.push({ text: 'Text', x: center.x, y: center.y, size: 48 });
  return { kind: 'text', index: texts.length - 1 };
}

/** Adds a character at the middle of the scene. The caller reloads the scene. */
export function placeCharacter(scene: SceneDef, image: string, size?: SceneDimensions | null): SceneSelection {
  const characters = scene.characters as CharacterDef[];
  const center = centerOf(size);
  characters.push({ image, x: center.x, y: center.y, scale: 1 });
  return { kind: 'character', index: characters.length - 1 };
}

/** A new scene has different objects, so the previous selection no longer applies. */
export function resetSceneEditor(): void {
  sceneEditor.selected = null;
  sceneEditor.hidden.clear();
  emitStructure();
}

export function notifySceneTransform(): void {
  for (const listener of transformListeners) {
    listener();
  }
}

export function onSceneStructure(listener: Listener): void {
  structureListeners.add(listener);
}

export function onSceneTransform(listener: Listener): void {
  transformListeners.add(listener);
}

/** The numbers to paste into level.json for the selected asset. */
export function sceneSnippet(scene: SceneDef, selection: SceneSelection | null): string {
  if (!selection) {
    return '';
  }
  if (selection.kind === 'background') {
    return scene.background ? `"background": ${JSON.stringify(scene.background)}` : '"background": none';
  }
  if (selection.kind === 'character') {
    const character = scene.characters[selection.index];
    if (!character) {
      return '';
    }
    return [
      `"image": ${JSON.stringify(character.image)}`,
      `"x": ${Math.round(character.x)}`,
      `"y": ${Math.round(character.y)}`,
      `"scale": ${roundScale(character.scale)}`,
    ].join(', ');
  }
  if (selection.kind === 'text') {
    const text = scene.texts[selection.index];
    if (!text) {
      return '';
    }
    return [
      `"text": ${JSON.stringify(text.text)}`,
      `"x": ${Math.round(text.x)}`,
      `"y": ${Math.round(text.y)}`,
      `"size": ${Math.round(text.size)}`,
    ].join(', ');
  }
  const trigger = scene.triggers[selection.index];
  if (!trigger) {
    return '';
  }
  const rect = triggerSnippet({
    id: trigger.id,
    x: Math.round(trigger.x),
    y: Math.round(trigger.y),
    width: Math.round(trigger.width),
    height: Math.round(trigger.height),
  });
  const once = `"once": ${trigger.once}`;
  return trigger.label ? `"label": ${JSON.stringify(trigger.label)}, ${rect}, ${once}` : `${rect}, ${once}`;
}

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}

function emitStructure(): void {
  for (const listener of structureListeners) {
    listener();
  }
}
