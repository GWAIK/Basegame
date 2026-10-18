import { Container, Graphics, Text } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';

type Control = 'minus' | 'plus' | 'ok';

/**
 * The black screen before a focus session.
 * The length looks adjustable, and it stays on one minute.
 */
export class FocusGate {
  readonly root = new Container({ label: 'focus-gate' });
  onConfirm: (() => void) | null = null;

  private readonly black = new Graphics();
  private readonly controls = new Container();
  private open = false;
  private choosing = false;
  private side = 1;
  private hover: Control | null = null;
  private hint = '';
  private faceKey = '';

  constructor() {
    this.root.addChild(this.black, this.controls);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  get isOpen(): boolean {
    return this.open;
  }

  get isChoosing(): boolean {
    return this.choosing;
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    this.faceKey = '';
    this.draw();
  }

  openGate(): void {
    this.open = true;
    this.choosing = true;
    this.hint = '';
    this.hover = null;
    this.faceKey = '';
    this.root.visible = true;
    this.controls.visible = true;
    this.draw();
  }

  /** Keeps the black and hides the picker while the monologue plays. */
  beginTalk(): void {
    this.choosing = false;
    this.hover = null;
    this.controls.visible = false;
    this.faceKey = '';
    this.draw();
  }

  close(): void {
    this.open = false;
    this.choosing = false;
    this.hover = null;
    this.hint = '';
    this.root.visible = false;
    this.controls.visible = false;
  }

  hoverAt(x: number, y: number): boolean {
    if (!this.choosing) {
      return false;
    }
    const next = this.controlAt(x, y);
    if (next !== this.hover) {
      this.hover = next;
      this.faceKey = '';
      this.draw();
    }
    return next !== null;
  }

  pointerDown(x: number, y: number): void {
    if (!this.choosing) {
      return;
    }
    const control = this.controlAt(x, y);
    if (control === 'ok') {
      this.onConfirm?.();
      return;
    }
    if (control === 'minus' || control === 'plus') {
      this.hint = 'One minute. You don\'t get more than that.';
      this.faceKey = '';
      this.draw();
    }
  }

  private controlAt(x: number, y: number): Control | null {
    const center = this.side / 2;
    const minus = { x: center - 150, y: center - 8 };
    const plus = { x: center + 150, y: center - 8 };
    if (insideCircle(x, y, minus.x, minus.y, 28)) {
      return 'minus';
    }
    if (insideCircle(x, y, plus.x, plus.y, 28)) {
      return 'plus';
    }
    const ok = { x: center - 90, y: center + 118, width: 180, height: 56 };
    if (x >= ok.x && x <= ok.x + ok.width && y >= ok.y && y <= ok.y + ok.height) {
      return 'ok';
    }
    return null;
  }

  private draw(): void {
    if (!this.open) {
      return;
    }
    this.black.clear();
    this.black.rect(0, 0, this.side, this.side).fill(0x000000);
    if (!this.choosing) {
      this.controls.removeChildren().forEach((child) => child.destroy({ children: true }));
      return;
    }
    const key = `${this.side}|${this.hover ?? ''}|${this.hint}`;
    if (key === this.faceKey) {
      return;
    }
    this.faceKey = key;
    this.controls.removeChildren().forEach((child) => child.destroy({ children: true }));

    const center = this.side / 2;
    const label = new Text({
      text: 'How long',
      anchor: 0.5,
      style: {
        fill: '#a89890',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '700',
        fontSize: 18,
        letterSpacing: 1.4,
      },
    });
    label.position.set(center, center - 132);

    const minutes = new Text({
      text: '1',
      anchor: 0.5,
      style: {
        fill: '#f4f1ea',
        fontFamily: GAME_FONTS.display,
        fontWeight: '700',
        fontSize: 120,
      },
    });
    minutes.position.set(center, center - 28);

    const unit = new Text({
      text: 'minute',
      anchor: 0.5,
      style: {
        fill: '#f4f1ea',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '600',
        fontSize: 22,
      },
    });
    unit.position.set(center, center + 48);

    this.controls.addChild(
      label,
      minutes,
      unit,
      this.stepper(center - 150, center - 8, 'minus', this.hover === 'minus'),
      this.stepper(center + 150, center - 8, 'plus', this.hover === 'plus'),
    );

    if (this.hint) {
      const hint = new Text({
        text: this.hint,
        anchor: 0.5,
        style: {
          fill: '#d97757',
          fontFamily: GAME_FONTS.cozy,
          fontWeight: '600',
          fontSize: 16,
        },
      });
      hint.position.set(center, center + 86);
      this.controls.addChild(hint);
    }

    const okY = center + 118;
    const ok = new Graphics();
    const hot = this.hover === 'ok';
    ok.roundRect(center - 90, okY, 180, 56, 28).fill({ color: hot ? 0xc86646 : 0xd97757 });
    const okLabel = new Text({
      text: 'OK',
      anchor: 0.5,
      style: {
        fill: '#fffaf5',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '700',
        fontSize: 22,
        letterSpacing: 1,
      },
    });
    okLabel.position.set(center, okY + 28);
    this.controls.addChild(ok, okLabel);
  }

  private stepper(x: number, y: number, kind: 'minus' | 'plus', hot: boolean): Graphics {
    const mark = new Graphics();
    mark.circle(x, y, 28).fill({ color: hot ? 0x1c1c1c : 0x000000 }).stroke({
      color: hot ? 0xf4f1ea : 0x6e6560,
      width: 2,
    });
    mark.moveTo(x - 10, y).lineTo(x + 10, y).stroke({ color: '#f4f1ea', width: 2, cap: 'round' });
    if (kind === 'plus') {
      mark.moveTo(x, y - 10).lineTo(x, y + 10).stroke({ color: '#f4f1ea', width: 2, cap: 'round' });
    }
    return mark;
  }
}

function insideCircle(x: number, y: number, cx: number, cy: number, radius: number): boolean {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}
