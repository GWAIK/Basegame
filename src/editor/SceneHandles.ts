import { Container, Graphics, type Text } from 'pixi.js';
import type { SceneDef } from '../content/types';
import type { Triggers } from '../triggers/Triggers';
import {
  notifySceneTransform,
  sceneEditor,
  sceneItemKey,
  selectSceneItem,
  type SceneKind,
  type SceneSelection,
} from './sceneEditor';

const HANDLE_SCREEN = 12;
const MIN_TRIGGER = 32;
const MIN_SCALE = 0.05;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type DragKind = 'move' | 'scale' | Handle;

interface Drag {
  kind: DragKind;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  scale: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  cursor: string;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Host {
  scene: SceneDef;
  root: Container;
  background: Container;
  characters: readonly Container[];
  texts: readonly Text[];
  triggers: Triggers;
  sceneSize: () => { width: number; height: number };
}

const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Selection outline and drag handles drawn on the scene while the Scene dock is open.
 * Dragging writes into the loaded level data. Paste the dock's values into level.json to keep them.
 */
export class SceneHandles {
  readonly overlay = new Container();
  private readonly graphics = new Graphics();
  private drag: Drag | null = null;

  constructor(private readonly host: Host) {
    this.overlay.label = 'scene-handles';
    this.overlay.eventMode = 'none';
    this.overlay.addChild(this.graphics);
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  get active(): boolean {
    return sceneEditor.open;
  }

  sync(sceneScale: number): void {
    const scale = sceneScale > 0 ? sceneScale : 1;
    this.applyVisibility();
    this.host.triggers.setHiddenTriggers(this.hiddenTriggerIds());
    this.draw(scale);
  }

  pointerDown(screenX: number, screenY: number): void {
    const local = this.toLocal(screenX, screenY);
    if (!local) {
      return;
    }
    const hit = this.hitTest(local.x, local.y);
    if (!hit) {
      selectSceneItem(null);
      this.drag = null;
      return;
    }
    selectSceneItem(hit);
    const drag = this.beginDrag(hit, local.x, local.y);
    this.drag = drag;
  }

  pointerMove(screenX: number, screenY: number): string | null {
    const local = this.toLocal(screenX, screenY);
    if (!local) {
      return null;
    }
    if (this.drag) {
      this.applyDrag(this.drag, local.x, local.y);
      notifySceneTransform();
      return this.drag.cursor;
    }
    const handleCursor = this.handleCursor(local.x, local.y);
    if (handleCursor) {
      return handleCursor;
    }
    const hit = this.hitTest(local.x, local.y);
    if (!hit) {
      return null;
    }
    if (hit.kind === 'background') {
      return 'default';
    }
    return 'move';
  }

  pointerUp(): void {
    if (!this.drag) {
      return;
    }
    this.finishDrag();
    this.drag = null;
    notifySceneTransform();
  }

  private applyVisibility(): void {
    const editing = sceneEditor.open;
    this.host.background.visible = !editing || !sceneEditor.hidden.has('background');
    this.host.characters.forEach((view, index) => {
      const character = this.host.scene.characters[index];
      if (!character) {
        return;
      }
      view.position.set(character.x, character.y);
      view.scale.set(character.scale);
      view.alpha = editing && sceneEditor.hidden.has(sceneItemKey('character', index)) ? 0 : 1;
    });
    this.host.texts.forEach((view, index) => {
      const text = this.host.scene.texts[index];
      if (!text) {
        return;
      }
      view.position.set(text.x, text.y);
      view.style.fontSize = text.size;
      if (view.text !== text.text) {
        view.text = text.text;
      }
      view.alpha = editing && sceneEditor.hidden.has(sceneItemKey('text', index)) ? 0 : 1;
    });
  }

  private hiddenTriggerIds(): ReadonlySet<string> {
    if (!sceneEditor.open) {
      return new Set();
    }
    const ids = new Set<string>();
    this.host.scene.triggers.forEach((trigger, index) => {
      if (sceneEditor.hidden.has(sceneItemKey('trigger', index, trigger.id))) {
        ids.add(trigger.id);
      }
    });
    return ids;
  }

  private draw(sceneScale: number): void {
    this.graphics.clear();
    const selection = sceneEditor.selected;
    if (!sceneEditor.open || !selection) {
      return;
    }
    const bounds = this.boundsOf(selection);
    if (!bounds) {
      return;
    }
    const stroke = Math.max(1, 1.5 / sceneScale);
    this.graphics
      .rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
      .stroke({ color: 0x0070e0, width: stroke, alpha: 0.95 });

    const handles = this.handlesFor(selection);
    if (handles.length === 0) {
      return;
    }
    const size = HANDLE_SCREEN / sceneScale;
    for (const handle of handles) {
      const point = this.handlePoint(bounds, handle);
      this.graphics
        .rect(point.x - size / 2, point.y - size / 2, size, size)
        .fill({ color: 0xffffff })
        .stroke({ color: 0x1a1404, width: Math.max(1, 1 / sceneScale) });
    }
  }

  private handleCursor(x: number, y: number): string | null {
    const selected = sceneEditor.selected;
    if (!selected) {
      return null;
    }
    const bounds = this.boundsOf(selected);
    if (!bounds) {
      return null;
    }
    const reach = HANDLE_SCREEN / (this.host.root.scale.x || 1);
    for (const handle of this.handlesFor(selected)) {
      const point = this.handlePoint(bounds, handle);
      if (Math.abs(x - point.x) <= reach && Math.abs(y - point.y) <= reach) {
        return cursorFor(selected.kind === 'character' ? 'scale' : handle);
      }
    }
    return null;
  }

  private hitTest(x: number, y: number): SceneSelection | null {
    const selected = sceneEditor.selected;
    if (selected) {
      const bounds = this.boundsOf(selected);
      const reach = HANDLE_SCREEN / (this.host.root.scale.x || 1);
      if (bounds) {
        for (const handle of this.handlesFor(selected)) {
          const point = this.handlePoint(bounds, handle);
          if (Math.abs(x - point.x) <= reach && Math.abs(y - point.y) <= reach) {
            return selected;
          }
        }
      }
    }

    const triggers = this.host.scene.triggers;
    for (let index = triggers.length - 1; index >= 0; index -= 1) {
      const trigger = triggers[index];
      if (!trigger || !this.pickable('trigger', index, trigger.id)) {
        continue;
      }
      if (Math.abs(x - trigger.x) <= trigger.width / 2 && Math.abs(y - trigger.y) <= trigger.height / 2) {
        return { kind: 'trigger', index };
      }
    }

    for (let index = this.host.texts.length - 1; index >= 0; index -= 1) {
      if (!this.pickable('text', index) || !this.contains(this.textBounds(index), x, y)) {
        continue;
      }
      return { kind: 'text', index };
    }

    for (let index = this.host.characters.length - 1; index >= 0; index -= 1) {
      if (!this.pickable('character', index) || !this.contains(this.characterBounds(index), x, y)) {
        continue;
      }
      return { kind: 'character', index };
    }

    const size = this.host.sceneSize();
    if (x >= 0 && y >= 0 && x <= size.width && y <= size.height && !sceneEditor.hidden.has('background')) {
      return { kind: 'background', index: 0 };
    }
    return null;
  }

  private beginDrag(selection: SceneSelection, x: number, y: number): Drag | null {
    if (selection.kind === 'background') {
      return null;
    }
    const bounds = this.boundsOf(selection);
    const reach = HANDLE_SCREEN / (this.host.root.scale.x || 1);
    let kind: DragKind = 'move';
    if (bounds) {
      for (const handle of this.handlesFor(selection)) {
        const point = this.handlePoint(bounds, handle);
        if (Math.abs(x - point.x) <= reach && Math.abs(y - point.y) <= reach) {
          kind = selection.kind === 'character' ? 'scale' : handle;
          break;
        }
      }
    }

    const origin = this.originOf(selection);
    return {
      kind,
      pointerX: x,
      pointerY: y,
      x: origin?.x ?? 0,
      y: origin?.y ?? 0,
      scale: selection.kind === 'character' ? (this.host.scene.characters[selection.index]?.scale ?? 1) : 1,
      left: bounds?.left ?? 0,
      top: bounds?.top ?? 0,
      right: bounds?.right ?? 0,
      bottom: bounds?.bottom ?? 0,
      cursor: cursorFor(kind),
    };
  }

  private applyDrag(drag: Drag, x: number, y: number): void {
    const selection = sceneEditor.selected;
    if (!selection) {
      return;
    }
    const dx = x - drag.pointerX;
    const dy = y - drag.pointerY;
    if (selection.kind === 'character') {
      const character = this.host.scene.characters[selection.index];
      if (!character) {
        return;
      }
      if (drag.kind === 'scale') {
        const start = Math.max(8, Math.hypot(drag.pointerX - drag.x, drag.pointerY - drag.y));
        const next = Math.max(8, Math.hypot(x - drag.x, y - drag.y));
        character.scale = Math.max(MIN_SCALE, drag.scale * (next / start));
        return;
      }
      character.x = drag.x + dx;
      character.y = drag.y + dy;
      return;
    }
    if (selection.kind === 'text') {
      const text = this.host.scene.texts[selection.index];
      if (!text) {
        return;
      }
      text.x = drag.x + dx;
      text.y = drag.y + dy;
      return;
    }
    const trigger = this.host.scene.triggers[selection.index];
    if (!trigger || drag.kind === 'scale') {
      return;
    }
    if (drag.kind === 'move') {
      trigger.x = drag.x + dx;
      trigger.y = drag.y + dy;
      return;
    }
    this.resizeTrigger(trigger, drag, dx, dy);
  }

  private finishDrag(): void {
    const selection = sceneEditor.selected;
    if (!selection) {
      return;
    }
    if (selection.kind === 'character') {
      const character = this.host.scene.characters[selection.index];
      if (!character) {
        return;
      }
      character.x = Math.round(character.x);
      character.y = Math.round(character.y);
      character.scale = Math.max(MIN_SCALE, Math.round(character.scale * 100) / 100);
      return;
    }
    if (selection.kind === 'text') {
      const text = this.host.scene.texts[selection.index];
      if (!text) {
        return;
      }
      text.x = Math.round(text.x);
      text.y = Math.round(text.y);
      return;
    }
    const trigger = this.host.scene.triggers[selection.index];
    if (!trigger) {
      return;
    }
    trigger.x = Math.round(trigger.x);
    trigger.y = Math.round(trigger.y);
    trigger.width = Math.max(MIN_TRIGGER, Math.round(trigger.width));
    trigger.height = Math.max(MIN_TRIGGER, Math.round(trigger.height));
  }

  private resizeTrigger(
    trigger: { x: number; y: number; width: number; height: number },
    drag: Drag,
    dx: number,
    dy: number,
  ): void {
    let left = drag.left;
    let right = drag.right;
    let top = drag.top;
    let bottom = drag.bottom;
    const handle = drag.kind;
    if (handle === 'move' || handle === 'scale') {
      return;
    }
    if (handle.includes('w')) {
      left += dx;
    }
    if (handle.includes('e')) {
      right += dx;
    }
    if (handle.includes('n')) {
      top += dy;
    }
    if (handle.includes('s')) {
      bottom += dy;
    }
    if (right - left < MIN_TRIGGER) {
      if (handle.includes('w')) {
        left = right - MIN_TRIGGER;
      } else {
        right = left + MIN_TRIGGER;
      }
    }
    if (bottom - top < MIN_TRIGGER) {
      if (handle.includes('n')) {
        top = bottom - MIN_TRIGGER;
      } else {
        bottom = top + MIN_TRIGGER;
      }
    }
    trigger.x = (left + right) / 2;
    trigger.y = (top + bottom) / 2;
    trigger.width = right - left;
    trigger.height = bottom - top;
  }

  private handlesFor(selection: SceneSelection): readonly Handle[] {
    if (selection.kind === 'character') {
      return ['se'];
    }
    if (selection.kind === 'trigger') {
      return HANDLES;
    }
    return [];
  }

  private boundsOf(selection: SceneSelection): Bounds | null {
    if (selection.kind === 'background') {
      const size = this.host.sceneSize();
      return { left: 0, top: 0, right: size.width, bottom: size.height };
    }
    if (selection.kind === 'character') {
      return this.characterBounds(selection.index);
    }
    if (selection.kind === 'text') {
      return this.textBounds(selection.index);
    }
    const trigger = this.host.scene.triggers[selection.index];
    if (!trigger) {
      return null;
    }
    return {
      left: trigger.x - trigger.width / 2,
      top: trigger.y - trigger.height / 2,
      right: trigger.x + trigger.width / 2,
      bottom: trigger.y + trigger.height / 2,
    };
  }

  private originOf(selection: SceneSelection): { x: number; y: number } | null {
    if (selection.kind === 'character') {
      const character = this.host.scene.characters[selection.index];
      return character ? { x: character.x, y: character.y } : null;
    }
    if (selection.kind === 'text') {
      const text = this.host.scene.texts[selection.index];
      return text ? { x: text.x, y: text.y } : null;
    }
    const trigger = this.host.scene.triggers[selection.index];
    return trigger ? { x: trigger.x, y: trigger.y } : null;
  }

  private characterBounds(index: number): Bounds | null {
    const view = this.host.characters[index];
    return view ? boundsOfDisplay(view, this.host.root) : null;
  }

  private textBounds(index: number): Bounds | null {
    const view = this.host.texts[index];
    return view ? boundsOfDisplay(view, this.host.root) : null;
  }

  private pickable(kind: SceneKind, index: number, triggerId?: string): boolean {
    const key = sceneItemKey(kind, index, triggerId);
    if (!sceneEditor.hidden.has(key)) {
      return true;
    }
    const selected = sceneEditor.selected;
    return selected !== null && selected.kind === kind && selected.index === index;
  }

  private contains(bounds: Bounds | null, x: number, y: number): boolean {
    if (!bounds) {
      return false;
    }
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  private handlePoint(bounds: Bounds, handle: Handle): { x: number; y: number } {
    const x = handle.includes('w') ? bounds.left : handle.includes('e') ? bounds.right : (bounds.left + bounds.right) / 2;
    const y = handle.includes('n') ? bounds.top : handle.includes('s') ? bounds.bottom : (bounds.top + bounds.bottom) / 2;
    return { x, y };
  }

  private toLocal(screenX: number, screenY: number): { x: number; y: number } | null {
    const world = this.host.root.parent;
    if (!world) {
      return null;
    }
    return this.host.root.toLocal({ x: screenX, y: screenY }, world.parent ?? undefined);
  }
}

function boundsOfDisplay(display: Container, root: Container): Bounds {
  const bounds = display.getBounds();
  const min = root.toLocal({ x: bounds.minX, y: bounds.minY });
  const max = root.toLocal({ x: bounds.maxX, y: bounds.maxY });
  return { left: min.x, top: min.y, right: max.x, bottom: max.y };
}

function cursorFor(kind: DragKind): string {
  if (kind === 'move') {
    return 'move';
  }
  if (kind === 'scale' || kind === 'nw' || kind === 'se') {
    return 'nwse-resize';
  }
  if (kind === 'ne' || kind === 'sw') {
    return 'nesw-resize';
  }
  if (kind === 'n' || kind === 's') {
    return 'ns-resize';
  }
  return 'ew-resize';
}
