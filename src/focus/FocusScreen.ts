import { Container, Graphics, Text } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';

type Choice = 'ok' | 'cancel';
type Mode = 'off' | 'choose' | 'black';

interface Hit {
  id: 'up' | 'down' | 'ok';
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The black screen before a focus session.
 * The minute picker only ever shows 01:00. That is the story.
 */
export class FocusScreen {
  readonly root = new Container({ label: 'focus' });

  private mode: Mode = 'off';
  private side = 1;
  private hover: Hit['id'] | null = null;
  private pending: ((choice: Choice) => void) | null = null;
  private readonly hits: Hit[] = [];
  private time: Text | null = null;
  private timeX = 0;
  private timeY = 0;
  private kick = 0;
  private kickDirection = 1;
  private fadeDone: (() => void) | null = null;
  private fadeMs = 1;
  private fadeElapsed = 0;

  constructor() {
    this.root.visible = false;
  }

  get isOpen(): boolean {
    return this.mode !== 'off';
  }

  get isChoosing(): boolean {
    return this.mode === 'choose';
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    if (this.mode !== 'off') {
      this.draw();
    }
  }

  /** Shows the picker. Resolves when the player confirms or leaves. */
  open(): Promise<Choice> {
    if (this.pending) {
      const previous = this.pending;
      this.pending = null;
      previous('cancel');
    }
    this.finishFade();
    this.mode = 'choose';
    this.kick = 0;
    this.root.alpha = 1;
    this.root.visible = true;
    this.draw();
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  /**
   * Covers the frame in black. The promise resolves when the fade is opaque,
   * so a line can play on the black before the menu returns.
   */
  fadeToBlack(durationMs = 900): Promise<void> {
    this.finishFade();
    if (this.pending) {
      const previous = this.pending;
      this.pending = null;
      previous('cancel');
    }
    this.mode = 'black';
    this.hover = null;
    this.kick = 0;
    this.root.visible = true;
    this.root.alpha = 0;
    this.draw();
    this.fadeElapsed = 0;
    this.fadeMs = Math.max(1, durationMs);
    return new Promise((resolve) => {
      this.fadeDone = resolve;
    });
  }

  close(): void {
    this.finishFade();
    this.mode = 'off';
    this.hover = null;
    this.time = null;
    this.hits.length = 0;
    this.root.alpha = 1;
    this.root.visible = false;
    this.root.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  /** Up and down are real buttons. The clock still refuses to leave one minute. */
  nudge(direction: -1 | 1): void {
    if (this.mode !== 'choose') {
      return;
    }
    this.kickDirection = direction;
    this.kick = 16;
  }

  confirm(): void {
    if (this.mode !== 'choose') {
      return;
    }
    this.mode = 'black';
    this.hover = null;
    this.time = null;
    this.draw();
    this.finish('ok');
  }

  cancel(): void {
    if (this.mode !== 'choose') {
      return;
    }
    this.finish('cancel');
    this.close();
  }

  update(deltaMS: number): void {
    if (this.fadeDone) {
      this.fadeElapsed += deltaMS;
      const linear = Math.min(1, this.fadeElapsed / this.fadeMs);
      const eased = linear * linear * (3 - 2 * linear);
      this.root.alpha = eased;
      if (linear >= 1) {
        this.root.alpha = 1;
        this.finishFade();
      }
    }
    if (!this.time || this.kick < 0.4) {
      this.kick = 0;
      if (this.time) {
        this.time.position.set(this.timeX, this.timeY);
      }
      return;
    }
    this.kick *= Math.pow(0.02, deltaMS / 1000);
    this.time.position.set(this.timeX + this.kick * this.kickDirection, this.timeY);
  }

  hoverAt(x: number, y: number): boolean {
    const next = this.hitAt(x, y);
    if (next !== this.hover) {
      this.hover = next;
      this.draw();
    }
    return next !== null;
  }

  pointerDown(x: number, y: number): void {
    const hit = this.hitAt(x, y);
    if (hit === 'up') {
      this.nudge(-1);
      return;
    }
    if (hit === 'down') {
      this.nudge(1);
      return;
    }
    if (hit === 'ok') {
      this.confirm();
    }
  }

  private finishFade(): void {
    const done = this.fadeDone;
    this.fadeDone = null;
    done?.();
  }

  private finish(choice: Choice): void {
    const pending = this.pending;
    this.pending = null;
    pending?.(choice);
  }

  private hitAt(x: number, y: number): Hit['id'] | null {
    if (this.mode !== 'choose') {
      return null;
    }
    for (const hit of this.hits) {
      if (x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) {
        return hit.id;
      }
    }
    return null;
  }

  private draw(): void {
    this.hits.length = 0;
    this.time = null;
    this.root.removeChildren().forEach((child) => child.destroy({ children: true }));

    const black = new Graphics();
    black.rect(0, 0, this.side, this.side).fill(0x000000);
    this.root.addChild(black);
    if (this.mode !== 'choose') {
      return;
    }

    const center = this.side / 2;
    const label = new Text({
      text: 'How long?',
      anchor: 0.5,
      style: {
        fill: '#f4ebe1',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '600',
        fontSize: 22,
        letterSpacing: 0.4,
      },
    });
    label.position.set(center, center - 148);
    this.root.addChild(label);

    this.addChevron('up', center, center - 78);
    this.timeX = center;
    this.timeY = center;
    const time = new Text({
      text: '01:00',
      anchor: 0.5,
      style: {
        fill: '#f4ebe1',
        fontFamily: GAME_FONTS.mono,
        fontWeight: '600',
        fontSize: 72,
        letterSpacing: 2,
      },
    });
    time.position.set(this.timeX, this.timeY);
    this.time = time;
    this.root.addChild(time);
    this.addChevron('down', center, center + 78);

    const buttonW = 160;
    const buttonH = 52;
    const buttonX = center - buttonW / 2;
    const buttonY = center + 140;
    const hot = this.hover === 'ok';
    const button = new Graphics();
    button.roundRect(buttonX, buttonY, buttonW, buttonH, 26).fill({ color: hot ? 0xc86646 : 0xd97757 });
    const caption = new Text({
      text: 'OK',
      anchor: 0.5,
      style: {
        fill: '#fffaf5',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '700',
        fontSize: 22,
      },
    });
    caption.position.set(center, buttonY + buttonH / 2);
    this.root.addChild(button, caption);
    this.hits.push({ id: 'ok', x: buttonX, y: buttonY, width: buttonW, height: buttonH });
  }

  private addChevron(id: 'up' | 'down', x: number, y: number): void {
    const size = 44;
    const hot = this.hover === id;
    const mark = new Graphics();
    const color = hot ? 0xfffaf5 : 0xf4ebe1;
    const tip = id === 'up' ? -10 : 10;
    const base = id === 'up' ? 8 : -8;
    mark.poly([x - 12, y + base, x + 12, y + base, x, y + tip]).fill({ color, alpha: hot ? 1 : 0.72 });
    this.root.addChild(mark);
    this.hits.push({ id, x: x - size / 2, y: y - size / 2, width: size, height: size });
  }
}
