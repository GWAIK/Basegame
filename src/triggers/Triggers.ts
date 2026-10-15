import { Container, Graphics, Text } from 'pixi.js';
import type { TriggerDef } from '../content/types';
import { setTriggerSelection, triggerDebug } from '../debug/triggerDebug';

const MIN_SIZE = 32;
const HANDLE_SCREEN = 14;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface Drag {
  handle: Handle | null;
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  cursor: string;
}

/**
 * Click boxes for one scene.
 * Parent root to the scene, then set onActivate to what a click does.
 * A trigger with a label draws a button. Without a label the box stays invisible.
 * With the debug panel's Show boxes on, a click selects a box instead:
 * drag the box to move it, drag a handle to resize it.
 */
export class Triggers {
  readonly root = new Container();
  onActivate: ((trigger: TriggerDef) => void) | null = null;

  private readonly definitions: readonly TriggerDef[];
  private readonly faces = new Container();
  private readonly debugLayer = new Container();
  private selected: TriggerDef | null = null;
  private drag: Drag | null = null;
  private hovered: string | null = null;
  private faceKey = '';
  private hiddenKey = '';
  private hiddenTriggerIds: ReadonlySet<string> = new Set();
  private shown = false;
  private drawnScale = 0;

  constructor(definitions: readonly TriggerDef[]) {
    this.definitions = definitions;
    this.root.label = 'triggers';
    this.root.eventMode = 'none';
    this.faces.label = 'buttons';
    this.debugLayer.label = 'trigger-debug';
    this.debugLayer.visible = false;
    this.root.addChild(this.faces, this.debugLayer);
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  /** Screen point. Runs the trigger's action, or edits it while boxes are shown. */
  pointerDown(screenX: number, screenY: number): void {
    const local = this.toLocal(screenX, screenY);
    if (!local) {
      return;
    }
    if (!this.editing) {
      const hit = this.bodyAt(local.x, local.y);
      if (hit) {
        this.onActivate?.(hit);
      }
      return;
    }

    if (this.selected) {
      const handle = this.handleAt(local.x, local.y, this.selected);
      if (handle) {
        this.drag = this.beginDrag(this.selected, local.x, local.y, handle);
        return;
      }
    }

    const hit = this.bodyAt(local.x, local.y);
    if (!hit) {
      this.clearSelection();
      this.redraw(this.drawnScale || 1);
      return;
    }
    this.selected = hit;
    this.drag = this.beginDrag(hit, local.x, local.y, null);
    this.publish();
    this.redraw(this.drawnScale || 1);
  }

  /** Screen point. Returns the CSS cursor to show, or null. */
  pointerMove(screenX: number, screenY: number): string | null {
    const local = this.toLocal(screenX, screenY);
    if (!local) {
      return null;
    }
    if (this.drag && this.selected) {
      this.applyDrag(this.selected, this.drag, local.x, local.y);
      this.publish();
      this.redraw(this.drawnScale || 1);
      return this.drag.cursor;
    }
    if (!this.editing) {
      const hit = this.bodyAt(local.x, local.y);
      this.hovered = hit?.label ? hit.id : null;
      return hit ? 'pointer' : null;
    }
    if (this.selected) {
      const handle = this.handleAt(local.x, local.y, this.selected);
      if (handle) {
        return cursorFor(handle);
      }
    }
    return this.bodyAt(local.x, local.y) ? 'move' : null;
  }

  pointerUp(): void {
    if (!this.drag || !this.selected) {
      this.drag = null;
      return;
    }
    const trigger = this.selected;
    trigger.x = Math.round(trigger.x);
    trigger.y = Math.round(trigger.y);
    trigger.width = Math.max(MIN_SIZE, Math.round(trigger.width));
    trigger.height = Math.max(MIN_SIZE, Math.round(trigger.height));
    this.drag = null;
    this.publish();
    this.redraw(this.drawnScale || 1);
  }

  /** Hides these trigger ids in the scene view. An empty set shows them all. */
  setHiddenTriggers(ids: ReadonlySet<string>): void {
    const key = [...ids].sort().join('|');
    if (key === this.hiddenKey) {
      return;
    }
    this.hiddenKey = key;
    this.hiddenTriggerIds = ids;
    this.faceKey = '';
    if (this.shown) {
      this.redraw(this.drawnScale || 1);
    }
  }

  /** Call every frame after the scene has been scaled. */
  sync(sceneScale: number): void {
    const scale = sceneScale > 0 ? sceneScale : 1;
    if (this.editing) {
      this.hovered = null;
    }
    this.drawFaces(scale);
    if (!this.editing) {
      if (this.shown || this.selected) {
        this.shown = false;
        this.debugLayer.visible = false;
        this.debugLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
        this.drag = null;
        this.clearSelection();
      }
      return;
    }
    this.debugLayer.visible = true;
    if (!this.shown || this.drawnScale !== scale) {
      this.shown = true;
      this.redraw(scale);
    }
  }

  /** Drops the debug selection. The container itself is destroyed with the scene. */
  dispose(): void {
    this.drag = null;
    this.clearSelection();
  }

  private isHidden(trigger: TriggerDef): boolean {
    return this.hiddenTriggerIds.has(trigger.id);
  }

  private get editing(): boolean {
    return import.meta.env.DEV && triggerDebug.visible;
  }

  private toLocal(screenX: number, screenY: number): { x: number; y: number } | null {
    if (!this.root.parent) {
      return null;
    }
    return this.root.toLocal({ x: screenX, y: screenY });
  }

  private bodyAt(x: number, y: number): TriggerDef | null {
    for (let index = this.definitions.length - 1; index >= 0; index -= 1) {
      const trigger = this.definitions[index];
      const insideX = Math.abs(x - trigger.x) <= trigger.width / 2;
      const insideY = Math.abs(y - trigger.y) <= trigger.height / 2;
      if (insideX && insideY) {
        return trigger;
      }
    }
    return null;
  }

  private handleAt(x: number, y: number, trigger: TriggerDef): Handle | null {
    const reach = HANDLE_SCREEN / (this.drawnScale || 1);
    for (const handle of HANDLES) {
      const point = handlePoint(trigger, handle);
      if (Math.abs(x - point.x) <= reach && Math.abs(y - point.y) <= reach) {
        return handle;
      }
    }
    return null;
  }

  private beginDrag(trigger: TriggerDef, x: number, y: number, handle: Handle | null): Drag {
    const edges = edgesOf(trigger);
    return {
      handle,
      pointerX: x,
      pointerY: y,
      left: edges.left,
      top: edges.top,
      right: edges.right,
      bottom: edges.bottom,
      cursor: handle ? cursorFor(handle) : 'move',
    };
  }

  private applyDrag(trigger: TriggerDef, drag: Drag, x: number, y: number): void {
    const dx = x - drag.pointerX;
    const dy = y - drag.pointerY;
    if (!drag.handle) {
      const width = drag.right - drag.left;
      const height = drag.bottom - drag.top;
      trigger.x = drag.left + width / 2 + dx;
      trigger.y = drag.top + height / 2 + dy;
      return;
    }

    let left = drag.left;
    let right = drag.right;
    let top = drag.top;
    let bottom = drag.bottom;
    if (drag.handle.includes('w')) {
      left += dx;
    }
    if (drag.handle.includes('e')) {
      right += dx;
    }
    if (drag.handle.includes('n')) {
      top += dy;
    }
    if (drag.handle.includes('s')) {
      bottom += dy;
    }
    if (right - left < MIN_SIZE) {
      if (drag.handle.includes('w')) {
        left = right - MIN_SIZE;
      } else {
        right = left + MIN_SIZE;
      }
    }
    if (bottom - top < MIN_SIZE) {
      if (drag.handle.includes('n')) {
        top = bottom - MIN_SIZE;
      } else {
        bottom = top + MIN_SIZE;
      }
    }
    trigger.x = (left + right) / 2;
    trigger.y = (top + bottom) / 2;
    trigger.width = right - left;
    trigger.height = bottom - top;
  }

  private publish(): void {
    setTriggerSelection(this.selected ? rectOf(this.selected) : null);
  }

  private clearSelection(): void {
    if (!this.selected && !triggerDebug.selected) {
      return;
    }
    this.selected = null;
    setTriggerSelection(null);
  }

  private drawFaces(sceneScale: number): void {
    const labeled = this.definitions.filter((trigger) => trigger.label && !this.isHidden(trigger));
    const key =
      labeled
        .map((trigger) => `${trigger.id}:${trigger.x}:${trigger.y}:${trigger.width}:${trigger.height}:${trigger.label}`)
        .join('|') + `|${this.hovered ?? ''}|${sceneScale}`;
    if (key === this.faceKey) {
      return;
    }
    this.faceKey = key;
    this.faces.removeChildren().forEach((child) => child.destroy({ children: true }));
    for (const trigger of labeled) {
      this.faces.addChild(drawButton(trigger, trigger.id === this.hovered));
    }
  }

  private redraw(sceneScale: number): void {
    this.drawnScale = sceneScale;
    this.debugLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const visible = this.definitions.filter((trigger) => !this.isHidden(trigger));
    const ordered = [
      ...visible.filter((trigger) => trigger !== this.selected),
      ...(this.selected && visible.includes(this.selected) ? [this.selected] : []),
    ];
    for (const trigger of ordered) {
      this.debugLayer.addChild(drawTrigger(trigger, trigger === this.selected, sceneScale));
    }
  }
}

const HANDLES: readonly Handle[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];

function rectOf(trigger: TriggerDef) {
  return {
    id: trigger.id,
    x: Math.round(trigger.x),
    y: Math.round(trigger.y),
    width: Math.round(trigger.width),
    height: Math.round(trigger.height),
  };
}

function edgesOf(trigger: TriggerDef): { left: number; top: number; right: number; bottom: number } {
  return {
    left: trigger.x - trigger.width / 2,
    top: trigger.y - trigger.height / 2,
    right: trigger.x + trigger.width / 2,
    bottom: trigger.y + trigger.height / 2,
  };
}

function handlePoint(trigger: TriggerDef, handle: Handle): { x: number; y: number } {
  const { left, top, right, bottom } = edgesOf(trigger);
  const x = handle.includes('w') ? left : handle.includes('e') ? right : trigger.x;
  const y = handle.includes('n') ? top : handle.includes('s') ? bottom : trigger.y;
  return { x, y };
}

function cursorFor(handle: Handle): string {
  if (handle === 'nw' || handle === 'se') {
    return 'nwse-resize';
  }
  if (handle === 'ne' || handle === 'sw') {
    return 'nesw-resize';
  }
  if (handle === 'n' || handle === 's') {
    return 'ns-resize';
  }
  return 'ew-resize';
}

function drawButton(trigger: TriggerDef, hovered: boolean): Container {
  const { left, top } = edgesOf(trigger);
  const box = new Graphics();
  box
    .roundRect(left, top, trigger.width, trigger.height, 2)
    .fill({ color: hovered ? 0x1c202a : 0x0c0e14, alpha: hovered ? 0.92 : 0.78 })
    .stroke({ color: 0xf4f1ea, width: 2, alpha: hovered ? 0.7 : 0.28 });

  const label = new Text({
    text: trigger.label ?? '',
    anchor: 0.5,
    style: {
      fill: '#f4f1ea',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: Math.max(18, Math.min(36, trigger.height * 0.42)),
    },
  });
  label.position.set(trigger.x, trigger.y);

  const root = new Container();
  root.addChild(box, label);
  return root;
}

function drawTrigger(trigger: TriggerDef, selected: boolean, sceneScale: number): Container {
  const { left, top } = edgesOf(trigger);
  const color = selected ? 0xffe14a : 0x3dff9a;
  const box = new Graphics();
  box
    .rect(left, top, trigger.width, trigger.height)
    .fill({ color, alpha: selected ? 0.2 : 0.16 })
    .stroke({ color, width: Math.max(2, 2 / sceneScale), alpha: 0.95 });

  const label = new Text({
    text: trigger.id,
    anchor: 0.5,
    style: {
      fill: selected ? '#fff6cc' : '#d8ffe9',
      fontFamily: 'system-ui, sans-serif',
      fontSize: Math.max(16, 18 / sceneScale),
    },
  });
  label.position.set(trigger.x, trigger.y);
  const pad = 8;
  const plate = new Graphics();
  plate
    .roundRect(
      trigger.x - label.width / 2 - pad,
      trigger.y - label.height / 2 - pad,
      label.width + pad * 2,
      label.height + pad * 2,
      4,
    )
    .fill({ color: 0x062016, alpha: 0.88 });

  const root = new Container();
  root.addChild(box, plate, label);
  if (selected) {
    const size = HANDLE_SCREEN / sceneScale;
    const handles = new Graphics();
    for (const handle of HANDLES) {
      const point = handlePoint(trigger, handle);
      handles
        .rect(point.x - size / 2, point.y - size / 2, size, size)
        .fill({ color: 0xffffff })
        .stroke({ color: 0x1a1404, width: Math.max(1, 1 / sceneScale) });
    }
    root.addChild(handles);
  }
  return root;
}
