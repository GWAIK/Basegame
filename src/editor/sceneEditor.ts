import type { SceneDef } from '../content/types';
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
 * Dev-only scene view, separate from the debug panel.
 * open turns on selection and dragging. hidden is editor-only: closing the
 * dock shows everything again, and a reload restores level.json.
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
  const current = sceneEditor.selected;
  if (current?.kind === selection?.kind && current?.index === selection?.index) {
    return;
  }
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
  return trigger.label ? `"label": ${JSON.stringify(trigger.label)}, ${rect}` : rect;
}

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}

function emitStructure(): void {
  for (const listener of structureListeners) {
    listener();
  }
}
