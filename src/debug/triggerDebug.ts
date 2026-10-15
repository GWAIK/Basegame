/** The numbers to paste into a trigger in level.json. */
export interface TriggerRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type SelectionListener = () => void;

const listeners = new Set<SelectionListener>();

/** Dev-only. The debug panel flips visible. Triggers stay invisible while it is false. */
export const triggerDebug = {
  visible: false,
  selected: null as TriggerRect | null,
};

export function setTriggerSelection(rect: TriggerRect | null): void {
  triggerDebug.selected = rect;
  for (const listener of listeners) {
    listener();
  }
}

export function onTriggerSelection(listener: SelectionListener): void {
  listeners.add(listener);
}

/** One trigger object, ready to replace the same id in level.json. */
export function triggerSnippet(rect: TriggerRect | null): string {
  if (!rect) {
    return '';
  }
  return [
    `"id": "${rect.id}"`,
    `"x": ${rect.x}`,
    `"y": ${rect.y}`,
    `"width": ${rect.width}`,
    `"height": ${rect.height}`,
  ].join(', ');
}
