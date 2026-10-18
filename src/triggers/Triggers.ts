import { Container, Graphics, Text } from 'pixi.js';
import type { TriggerDef } from '../content/types';
import { devTools } from '../debug/devTools';
import { setTriggerSelection, triggerDebug } from '../debug/triggerDebug';
import { notifySceneTransform, sceneEditor, selectSceneItem } from '../editor/sceneEditor';
import { GAME_FONTS } from '../theme/fonts';

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
  private debugKey = '';
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
      selectSceneItem(null);
      this.redraw(this.drawnScale || 1);
      return;
    }
    this.selected = hit;
    this.drag = this.beginDrag(hit, local.x, local.y, null);
    const index = this.definitions.indexOf(hit);
    if (index !== -1) {
      selectSceneItem({ kind: 'trigger', index });
    }
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
      notifySceneTransform();
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
    notifySceneTransform();
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
    this.debugKey = '';
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
        this.debugKey = '';
        this.debugLayer.visible = false;
        this.debugLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
        this.drag = null;
        this.clearSelection();
      }
      return;
    }
    this.syncEditorSelection();
    this.debugLayer.visible = true;
    const key = this.computeDebugKey(scale);
    if (!this.shown || key !== this.debugKey) {
      this.shown = true;
      this.debugKey = key;
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
    return devTools.enabled && triggerDebug.visible;
  }

  private toLocal(screenX: number, screenY: number): { x: number; y: number } | null {
    const scene = this.root.parent?.parent;
    if (!scene) {
      return null;
    }
    return this.root.toLocal({ x: screenX, y: screenY }, scene.parent?.parent ?? undefined);
  }

  private bodyAt(x: number, y: number): TriggerDef | null {
    for (let index = this.definitions.length - 1; index >= 0; index -= 1) {
      const trigger = this.definitions[index];
      if (!trigger || this.isHidden(trigger)) {
        continue;
      }
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
    const showHandles = !sceneEditor.open;
    for (const trigger of ordered) {
      this.debugLayer.addChild(drawTrigger(trigger, trigger === this.selected && showHandles, sceneScale));
    }
  }

  private syncEditorSelection(): void {
    const selection = sceneEditor.selected;
    const next =
      selection?.kind === 'trigger' ? (this.definitions[selection.index] ?? null) : null;
    if (next !== this.selected) {
      this.selected = next;
      this.publish();
    }
  }

  private computeDebugKey(sceneScale: number): string {
    const visible = this.definitions.filter((trigger) => !this.isHidden(trigger));
    return (
      visible
        .map((trigger) => `${trigger.id}:${trigger.x}:${trigger.y}:${trigger.width}:${trigger.height}:${trigger === this.selected ? 1 : 0}`)
        .join('|') + `|${sceneEditor.open ? 1 : 0}|${sceneScale}`
    );
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
  const id = trigger.id.toLowerCase();
  const isIconOnly = Math.abs(trigger.width - trigger.height) <= 24 && trigger.width <= 120;
  const isPrimary = id === 'play' || (trigger.label ?? '').toLowerCase().includes('focus');

  const box = new Graphics();
  const radius = isIconOnly ? Math.min(trigger.width, trigger.height) / 2 : Math.min(38, trigger.height / 2);

  if (isPrimary) {
    box
      .roundRect(left, top, trigger.width, trigger.height, radius)
      .fill({ color: hovered ? 0xc86646 : 0xd97757, alpha: 1 })
      .stroke({ color: 0xb95a3b, width: 2, alpha: hovered ? 0.65 : 0.35 });
  } else {
    box
      .roundRect(left, top, trigger.width, trigger.height, radius)
      .fill({ color: hovered ? 0xefe3d5 : 0xf7efe6, alpha: 1 })
      .stroke({ color: hovered ? 0xd97757 : 0xdecbb8, width: 2, alpha: 0.95 });
  }

  const root = new Container();
  root.addChild(box);

  if (isIconOnly) {
    root.addChild(drawButtonIcon(id, trigger.x, trigger.y, Math.min(trigger.width, trigger.height) * 0.24, hovered));
    return root;
  }

  const labelText = trigger.label ?? '';
  const label = new Text({
    text: labelText,
    anchor: 0.5,
    style: {
      fill: isPrimary ? '#fffaf5' : '#4a372d',
      fontFamily: GAME_FONTS.cozy,
      fontWeight: '700',
      fontSize: Math.max(18, Math.min(30, trigger.height * 0.38)),
      letterSpacing: 0.5,
    },
  });

  if (isPrimary) {
    const iconSize = Math.max(10, Math.min(15, trigger.height * 0.19));
    const gap = 14;
    const totalW = iconSize * 1.4 + gap + label.width;
    const startX = trigger.x - totalW / 2;
    const playIcon = new Graphics();
    const ix = startX + iconSize * 0.6;
    const iy = trigger.y;
    playIcon
      .poly([
        ix - iconSize * 0.55,
        iy - iconSize * 0.75,
        ix + iconSize * 0.85,
        iy,
        ix - iconSize * 0.55,
        iy + iconSize * 0.75,
      ])
      .fill({ color: 0xfffaf5 });
    label.position.set(startX + iconSize * 1.4 + gap + label.width / 2, trigger.y);
    root.addChild(playIcon, label);
  } else {
    label.position.set(trigger.x, trigger.y);
    root.addChild(label);
  }

  return root;
}

function drawButtonIcon(id: string, cx: number, cy: number, r: number, hovered: boolean): Graphics {
  const icon = new Graphics();
  const color = hovered ? 0xd97757 : 0x5c4438;
  const strokeWidth = Math.max(2.5, r * 0.18);

  if (id.includes('setting')) {
    const teeth = 8;
    for (let i = 0; i < teeth; i += 1) {
      const angle = (i * Math.PI * 2) / teeth;
      const x1 = cx + Math.cos(angle) * (r * 0.72);
      const y1 = cy + Math.sin(angle) * (r * 0.72);
      const x2 = cx + Math.cos(angle) * (r * 1.08);
      const y2 = cy + Math.sin(angle) * (r * 1.08);
      icon.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: strokeWidth * 1.15, cap: 'round' });
    }
    icon.circle(cx, cy, r * 0.76).fill({ color: hovered ? 0xefe3d5 : 0xf7efe6 }).stroke({ color, width: strokeWidth });
    icon.circle(cx, cy, r * 0.32).stroke({ color, width: strokeWidth });
    return icon;
  }

  if (id.includes('shop')) {
    icon.roundRect(cx - r * 0.62, cy - r * 0.2, r * 1.24, r * 1.05, r * 0.22).stroke({ color, width: strokeWidth });
    icon
      .moveTo(cx - r * 0.34, cy - r * 0.2)
      .arc(cx, cy - r * 0.2, r * 0.34, Math.PI, 0)
      .stroke({ color, width: strokeWidth, cap: 'round' });
    return icon;
  }

  if (id.includes('quit') || id.includes('power') || id.includes('exit')) {
    const a0 = -Math.PI * 0.22;
    const a1 = Math.PI * 1.22;
    icon
      .moveTo(cx + Math.cos(a0) * r * 0.82, cy + r * 0.06 + Math.sin(a0) * r * 0.82)
      .arc(cx, cy + r * 0.06, r * 0.82, a0, a1)
      .stroke({
        color,
        width: strokeWidth,
        cap: 'round',
      });
    icon
      .moveTo(cx, cy - r * 0.95)
      .lineTo(cx, cy - r * 0.1)
      .stroke({ color, width: strokeWidth, cap: 'round' });
    return icon;
  }

  if (id.includes('back')) {
    icon
      .moveTo(cx + r * 0.55, cy)
      .lineTo(cx - r * 0.55, cy)
      .moveTo(cx - r * 0.1, cy - r * 0.5)
      .lineTo(cx - r * 0.6, cy)
      .lineTo(cx - r * 0.1, cy + r * 0.5)
      .stroke({ color, width: strokeWidth, cap: 'round', join: 'round' });
    return icon;
  }

  icon
    .poly([cx - r * 0.45, cy - r * 0.65, cx + r * 0.75, cy, cx - r * 0.45, cy + r * 0.65])
    .fill({ color });
  return icon;
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
