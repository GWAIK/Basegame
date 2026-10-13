import type { DialogueLine } from '../content/types';
import type { DialogueBox } from './DialogueBox';

export class DialogueManager {
  private lines: readonly DialogueLine[] = [];
  private index = 0;
  private active = false;
  private onClose: (() => void) | null = null;

  constructor(private readonly box: DialogueBox) {
    this.box.hide();
  }

  get isActive(): boolean {
    return this.active;
  }

  /** onClose runs once, when the last line is passed or the dialogue is closed. */
  start(lines: readonly DialogueLine[], onClose?: () => void): void {
    this.close();
    if (lines.length === 0) {
      onClose?.();
      return;
    }

    this.lines = lines;
    this.index = 0;
    this.active = true;
    this.onClose = onClose ?? null;
    this.showCurrent();
  }

  advance(): void {
    if (!this.active) {
      return;
    }

    this.index += 1;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }

    this.showCurrent();
  }

  close(): void {
    const onClose = this.onClose;
    this.active = false;
    this.lines = [];
    this.index = 0;
    this.onClose = null;
    this.box.hide();
    onClose?.();
  }

  resize(width: number, height: number): void {
    this.box.resize(width, height);
  }

  private showCurrent(): void {
    const line = this.lines[this.index];
    if (!line) {
      this.close();
      return;
    }
    this.box.show(line.speaker, line.text);
  }
}
