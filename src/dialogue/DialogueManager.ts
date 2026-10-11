import type { DialogueBox } from './DialogueBox';

export interface DialogueLine {
  speaker: string;
  text: string;
}

export class DialogueManager {
  private lines: DialogueLine[] = [];
  private index = 0;
  private active = false;

  constructor(private readonly box: DialogueBox) {
    this.box.hide();
  }

  get isActive(): boolean {
    return this.active;
  }

  start(lines: readonly DialogueLine[]): void {
    if (lines.length === 0) {
      this.close();
      return;
    }

    this.lines = lines.slice();
    this.index = 0;
    this.active = true;
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
    this.active = false;
    this.lines = [];
    this.index = 0;
    this.box.hide();
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
