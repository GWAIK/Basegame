import type { Story } from 'inkjs/compiler/Compiler';
import type { DialogueBox } from './DialogueBox';
import { isEnding, readInkLine, type InkEffect } from './inkTags';

export interface ScriptedLine {
  speaker: string;
  text: string;
}

/**
 * Shows one line at a time.
 * A notice is a fixed list. An Ink knot is stepped from the shared story,
 * so facts set in one knot are still true in the next.
 */
export class DialogueManager {
  private lines: readonly ScriptedLine[] = [];
  private index = 0;
  private active = false;
  private onClose: (() => void) | null = null;
  private story: Story | null = null;
  private onEffect: ((effect: InkEffect) => void) | null = null;
  private onInkDone: ((ending: InkEffect | null) => void) | null = null;
  private pendingEnding: InkEffect | null = null;
  private choosing = false;
  private shownLine = false;

  constructor(private readonly box: DialogueBox) {
    this.box.hide();
  }

  get isActive(): boolean {
    return this.active;
  }

  get hasChoices(): boolean {
    return this.choosing;
  }

  /** onClose runs once, when the last line is passed or the dialogue is closed. */
  start(lines: readonly ScriptedLine[], onClose?: () => void): void {
    this.close();
    if (lines.length === 0) {
      onClose?.();
      return;
    }

    this.lines = lines;
    this.index = 0;
    this.active = true;
    this.onClose = onClose ?? null;
    this.showScripted();
  }

  /**
   * Jumps to a knot and shows it one line at a time.
   * The promise resolves with a go, level, or quit tag, or null when the knot ends.
   */
  play(story: Story, knot: string, onEffect: (effect: InkEffect) => void): Promise<InkEffect | null> {
    this.close();
    return new Promise((resolve) => {
      this.story = story;
      this.onEffect = onEffect;
      this.onInkDone = resolve;
      this.shownLine = false;
      this.active = true;
      try {
        story.ChoosePathString(knot, true);
      } catch (error) {
        console.warn(`[ink] ${error instanceof Error ? error.message : String(error)}`);
        this.finishInk(null);
        return;
      }
      this.stepInk();
    });
  }

  /** Screen point, so a click can land on a choice. */
  advance(x = -1, y = -1): void {
    if (!this.active) {
      return;
    }
    if (this.story) {
      this.advanceInk(x, y);
      return;
    }

    this.index += 1;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.showScripted();
  }

  /** Moves the red highlight. Wrapping stays inside the list. */
  moveChoice(delta: number): void {
    if (!this.choosing) {
      return;
    }
    this.box.moveSelection(delta);
  }

  /** Picks the highlighted reply. */
  confirmChoice(): void {
    if (!this.choosing) {
      return;
    }
    this.choose(this.box.selection);
  }

  /** Highlights the reply under the pointer. Returns whether the pointer is on one. */
  hover(x: number, y: number): boolean {
    if (!this.choosing) {
      return false;
    }
    const index = this.box.choiceAt(x, y);
    if (index !== null) {
      this.box.highlight(index);
    }
    return index !== null;
  }

  /** 0 is the first choice. */
  choose(index: number): void {
    if (!this.choosing || !this.story) {
      return;
    }
    if (index < 0 || index >= this.story.currentChoices.length) {
      return;
    }
    this.story.ChooseChoiceIndex(index);
    this.choosing = false;
    this.box.setChoices([]);
    this.stepInk();
  }

  close(): void {
    if (this.story) {
      this.finishInk(null);
      return;
    }

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

  private showScripted(): void {
    const line = this.lines[this.index];
    if (!line) {
      this.close();
      return;
    }
    this.box.show(line.speaker, line.text);
  }

  private advanceInk(x: number, y: number): void {
    if (this.choosing) {
      const index = this.box.choiceAt(x, y);
      if (index !== null) {
        this.choose(index);
      }
      return;
    }
    if (this.pendingEnding) {
      const ending = this.pendingEnding;
      this.pendingEnding = null;
      this.finishInk(ending);
      return;
    }
    this.stepInk();
  }

  private stepInk(): void {
    const story = this.story;
    if (!story) {
      return;
    }

    while (story.canContinue) {
      const raw = story.Continue() ?? '';
      const tags = story.currentTags ?? [];
      const line = readInkLine(raw, tags);
      const ending = line.effects.find(isEnding) ?? null;
      for (const effect of line.effects) {
        if (!isEnding(effect)) {
          this.onEffect?.(effect);
        }
      }
      if (line.text.length > 0) {
        this.pendingEnding = ending;
        this.shownLine = true;
        this.box.show(line.speaker, line.text);
        return;
      }
      if (ending) {
        this.finishInk(ending);
        return;
      }
    }

    const choices = story.currentChoices;
    if (choices.length > 0) {
      this.choosing = true;
      if (!this.shownLine) {
        this.box.show('', '');
      }
      this.box.setChoices(choices.map((choice) => choice.text));
      return;
    }
    this.finishInk(null);
  }

  private finishInk(ending: InkEffect | null): void {
    const done = this.onInkDone;
    this.story = null;
    this.onEffect = null;
    this.onInkDone = null;
    this.pendingEnding = null;
    this.choosing = false;
    this.shownLine = false;
    this.active = false;
    this.box.hide();
    done?.(ending);
  }
}
