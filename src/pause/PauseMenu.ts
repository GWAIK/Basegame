import { Container, Graphics, Text } from 'pixi.js';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import { fitScene } from '../scenes/fitScene';
import { PAUSE_BOARD_HEIGHT, PAUSE_BOARD_WIDTH, PAUSE_CONFIG } from './PauseConfig';

export type PauseAction = 'resume' | 'settings' | 'menu';

/**
 * Resume, Settings, and Main menu, drawn like the main-menu buttons.
 * Sits above the blurred play field. Game owns opening and the blur filter.
 */
export class PauseMenu {
  readonly root = new Container();

  onSelect: ((action: PauseAction) => void) | null = null;

  private readonly buttons = new Container();
  private viewWidth = 1;
  private viewHeight = 1;
  private hovered: PauseAction | null = null;
  private faceKey = '';

  constructor() {
    this.root.label = 'pause';
    this.root.visible = false;
    this.root.addChild(this.buttons);
  }

  setOpen(open: boolean): void {
    this.root.visible = open;
    if (!open) {
      this.hovered = null;
      this.faceKey = '';
    }
    this.layout();
  }

  resize(width: number, height: number): void {
    this.viewWidth = Math.max(width, 1);
    this.viewHeight = Math.max(height, 1);
    this.layout();
  }

  /** Reads button size and placement, so the debug panel applies while paused. */
  update(): void {
    if (!this.root.visible) {
      return;
    }
    this.layout();
  }

  hover(x: number, y: number): boolean {
    const next = this.hit(x, y);
    if (next !== this.hovered) {
      this.hovered = next;
      this.faceKey = '';
      this.layout();
    }
    return next !== null;
  }

  pointerDown(x: number, y: number): void {
    const action = this.hit(x, y);
    if (action) {
      this.onSelect?.(action);
    }
  }

  private layout(): void {
    const transform = fitScene(
      'cover',
      this.viewWidth,
      this.viewHeight,
      PAUSE_BOARD_WIDTH,
      PAUSE_BOARD_HEIGHT,
      CAMERA_CONFIG,
    );
    this.root.scale.set(transform.scale);
    this.root.position.set(transform.x, transform.y);

    const key = [
      PAUSE_CONFIG.buttonWidth,
      PAUSE_CONFIG.buttonHeight,
      PAUSE_CONFIG.x,
      PAUSE_CONFIG.resumeY,
      PAUSE_CONFIG.settingsY,
      PAUSE_CONFIG.menuY,
      this.hovered ?? '',
    ].join('|');
    if (key === this.faceKey) {
      return;
    }
    this.faceKey = key;
    this.buttons.removeChildren().forEach((child) => child.destroy({ children: true }));
    for (const item of this.items()) {
      this.buttons.addChild(drawButton(item, item.id === this.hovered));
    }
  }

  private hit(screenX: number, screenY: number): PauseAction | null {
    const scale = this.root.scale.x || 1;
    const x = (screenX - this.root.x) / scale;
    const y = (screenY - this.root.y) / scale;
    for (const item of this.items()) {
      const left = item.x - item.width / 2;
      const top = item.y - item.height / 2;
      if (x >= left && x <= left + item.width && y >= top && y <= top + item.height) {
        return item.id;
      }
    }
    return null;
  }

  private items(): readonly PauseButton[] {
    const width = PAUSE_CONFIG.buttonWidth;
    const height = PAUSE_CONFIG.buttonHeight;
    const x = PAUSE_CONFIG.x;
    return [
      { id: 'resume', label: 'Resume', x, y: PAUSE_CONFIG.resumeY, width, height },
      { id: 'settings', label: 'Settings', x, y: PAUSE_CONFIG.settingsY, width, height },
      { id: 'menu', label: 'Main menu', x, y: PAUSE_CONFIG.menuY, width, height },
    ];
  }
}

interface PauseButton {
  id: PauseAction;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Same plate as a labeled trigger on the main menu. */
function drawButton(button: PauseButton, hovered: boolean): Container {
  const left = button.x - button.width / 2;
  const top = button.y - button.height / 2;
  const box = new Graphics();
  box
    .roundRect(left, top, button.width, button.height, 2)
    .fill({ color: hovered ? 0x1c202a : 0x0c0e14, alpha: hovered ? 0.92 : 0.78 })
    .stroke({ color: 0xf4f1ea, width: 2, alpha: hovered ? 0.7 : 0.28 });

  const label = new Text({
    text: button.label,
    anchor: 0.5,
    style: {
      fill: '#f4f1ea',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: Math.max(18, Math.min(36, button.height * 0.42)),
    },
  });
  label.position.set(button.x, button.y);

  const root = new Container();
  root.addChild(box, label);
  return root;
}
