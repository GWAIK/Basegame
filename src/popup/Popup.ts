import { Container, Graphics, Text } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';

const INK = '#4a372d';
const CREAM = 0xfffbf7;
const TERRACOTTA = 0xd97757;
const TERRACOTTA_HOT = 0xc86646;
const LINE = 0xe6d6c5;

/** One card. Later callers can pass their own title, text, and button. */
export interface PopupMessage {
  title?: string;
  text: string;
  /** Button label. Defaults to OK. */
  confirm?: string;
}

interface Pending {
  message: PopupMessage;
  resolve: () => void;
}

/**
 * A card over a dimmed frame. show() queues, so several rewards can follow each other.
 */
export class Popup {
  readonly root = new Container({ label: 'popup' });
  onDismiss: (() => void) | null = null;

  private readonly queue: Pending[] = [];
  private current: Pending | null = null;
  private side = 1;
  private hover = false;
  private button: { x: number; y: number; width: number; height: number } | null = null;

  constructor() {
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    if (this.current) {
      this.draw();
    }
  }

  /** Resolves when this card is dismissed. A card already up waits its turn. */
  show(message: PopupMessage): Promise<void> {
    const text = message.text.trim();
    if (text.length === 0 && !(message.title ?? '').trim()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push({ message: { ...message, text }, resolve });
      if (!this.current) {
        this.presentNext();
      }
    });
  }

  dismiss(): void {
    const current = this.current;
    if (!current) {
      return;
    }
    this.current = null;
    this.hover = false;
    this.button = null;
    this.onDismiss?.();
    current.resolve();
    this.presentNext();
  }

  hoverAt(x: number, y: number): boolean {
    const next = this.hitsButton(x, y);
    if (next !== this.hover) {
      this.hover = next;
      this.draw();
    }
    return next;
  }

  pointerDown(x: number, y: number): void {
    if (this.hitsButton(x, y)) {
      this.dismiss();
    }
  }

  private presentNext(): void {
    const next = this.queue.shift() ?? null;
    this.current = next;
    this.hover = false;
    this.button = null;
    if (!next) {
      this.root.visible = false;
      this.root.removeChildren().forEach((child) => child.destroy({ children: true }));
      return;
    }
    this.root.visible = true;
    this.draw();
  }

  private hitsButton(x: number, y: number): boolean {
    const button = this.button;
    if (!button) {
      return false;
    }
    return x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height;
  }

  private draw(): void {
    const pending = this.current;
    if (!pending) {
      return;
    }
    this.root.removeChildren().forEach((child) => child.destroy({ children: true }));

    const dim = new Graphics();
    dim.rect(0, 0, this.side, this.side).fill({ color: 0x000000, alpha: 0.45 });
    this.root.addChild(dim);

    const cardWidth = Math.min(440, Math.max(240, this.side - 80));
    const textWidth = cardWidth - 56;
    const title = pending.message.title?.trim() ?? '';
    const titleText = title.length > 0 ? this.label(title, 28, GAME_FONTS.display, '700', textWidth) : null;
    const body = this.label(pending.message.text, 22, GAME_FONTS.cozy, '600', textWidth);
    const buttonWidth = 148;
    const buttonHeight = 48;
    const gap = 22;
    const padTop = 32;
    const padBottom = 28;
    const titleBlock = titleText ? titleText.height + 14 : 0;
    const cardHeight = padTop + titleBlock + body.height + gap + buttonHeight + padBottom;
    const cardX = (this.side - cardWidth) / 2;
    const cardY = Math.max(24, (this.side - cardHeight) / 2);

    const card = new Graphics();
    card.roundRect(cardX, cardY, cardWidth, cardHeight, 28).fill({ color: CREAM }).stroke({ color: LINE, width: 2 });
    this.root.addChild(card);

    let cursor = cardY + padTop;
    if (titleText) {
      titleText.position.set(this.side / 2, cursor);
      this.root.addChild(titleText);
      cursor += titleText.height + 14;
    }
    body.position.set(this.side / 2, cursor);
    this.root.addChild(body);
    cursor += body.height + gap;

    const buttonX = (this.side - buttonWidth) / 2;
    const button = new Graphics();
    button.roundRect(buttonX, cursor, buttonWidth, buttonHeight, 24).fill({
      color: this.hover ? TERRACOTTA_HOT : TERRACOTTA,
    });
    const caption = new Text({
      text: pending.message.confirm?.trim() || 'OK',
      anchor: 0.5,
      style: {
        fill: '#fffaf5',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '700',
        fontSize: 20,
      },
    });
    caption.position.set(this.side / 2, cursor + buttonHeight / 2);
    this.root.addChild(button, caption);
    this.button = { x: buttonX, y: cursor, width: buttonWidth, height: buttonHeight };
  }

  private label(text: string, size: number, family: string, weight: '600' | '700', width: number): Text {
    const label = new Text({
      text,
      style: {
        fill: INK,
        fontFamily: family,
        fontWeight: weight,
        fontSize: size,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: width,
      },
    });
    label.anchor.set(0.5, 0);
    return label;
  }
}
