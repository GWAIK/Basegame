import { Container, Graphics, Text } from 'pixi.js';

const MARGIN = 28;
const MAX_WIDTH = 720;
const CHOICE_WIDTH = 820;
const PADDING = 18;
const CHOICE_RED = 0xb01e2c;

/**
 * Screen-space dialogue panel. Parent it to the UI layer, not the camera world.
 * Choices are drawn under the line. The game hit-tests them from the click position.
 */
export class DialogueBox {
  private readonly root = new Container();
  private readonly background = new Graphics();
  private readonly speaker: Text;
  private readonly body: Text;
  private readonly hint: Text;
  private readonly choiceRows: Container[] = [];
  private selectedChoice = 0;
  private viewWidth = 800;
  private viewHeight = 600;

  constructor(ui: Container) {
    this.speaker = new Text({
      text: '',
      style: {
        fill: '#ffffff',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 14,
      },
    });

    this.body = new Text({
      text: '',
      style: {
        fill: '#ffffff',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 22,
        wordWrap: true,
        wordWrapWidth: 400,
      },
    });

    this.hint = new Text({
      text: 'Click, Space, or Enter',
      style: {
        fill: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
      },
    });
    this.hint.alpha = 0.45;

    this.root.addChild(this.background, this.speaker, this.body, this.hint);
    this.root.visible = false;
    this.root.eventMode = 'none';
    ui.addChild(this.root);
  }

  show(speaker: string, text: string): void {
    this.clearChoices();
    this.speaker.text = speaker;
    this.body.text = text;
    this.hint.visible = true;
    this.root.visible = true;
    this.layout();
  }

  get selection(): number {
    return this.selectedChoice;
  }

  /** Draws every reply at once. The first one starts highlighted. */
  setChoices(labels: readonly string[]): void {
    this.clearChoices();
    this.selectedChoice = 0;
    labels.forEach((label, index) => {
      this.choiceRows.push(createChoice(label, index));
      this.root.addChild(this.choiceRows[this.choiceRows.length - 1]);
    });
    this.hint.visible = labels.length === 0;
    this.root.visible = true;
    this.layout();
  }

  highlight(index: number): void {
    if (index === this.selectedChoice || index < 0 || index >= this.choiceRows.length) {
      return;
    }
    this.selectedChoice = index;
    this.layout();
  }

  moveSelection(delta: number): void {
    const count = this.choiceRows.length;
    if (count === 0) {
      return;
    }
    this.selectedChoice = (this.selectedChoice + delta + count) % count;
    this.layout();
  }

  /** Screen point. Returns the choice index, or null when the point misses every button. */
  choiceAt(x: number, y: number): number | null {
    for (let index = 0; index < this.choiceRows.length; index += 1) {
      const bounds = this.choiceRows[index].getBounds();
      if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
        return index;
      }
    }
    return null;
  }

  hide(): void {
    this.clearChoices();
    this.root.visible = false;
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    if (this.root.visible) {
      this.layout();
    }
  }

  private clearChoices(): void {
    for (const row of this.choiceRows) {
      row.destroy({ children: true });
    }
    this.choiceRows.length = 0;
  }

  private layout(): void {
    if (this.choiceRows.length > 0) {
      this.layoutChoices();
      return;
    }

    const width = Math.min(MAX_WIDTH, Math.max(280, this.viewWidth - MARGIN * 2));
    this.body.style.wordWrapWidth = width - PADDING * 2;

    const hasSpeaker = this.speaker.text.trim().length > 0;
    this.speaker.visible = hasSpeaker;
    const speakerY = PADDING;
    const bodyY = hasSpeaker ? speakerY + this.speaker.height + 8 : PADDING;
    const hasBody = this.body.text.trim().length > 0;
    this.body.visible = hasBody;
    const cursor = hasBody ? bodyY + this.body.height + 14 : bodyY;
    const height = cursor + this.hint.height + PADDING;
    const x = (this.viewWidth - width) / 2;
    const y = this.viewHeight - height - MARGIN;

    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 8)
      .fill({ color: 0x0c0e14, alpha: 0.9 })
      .stroke({ color: 0xffffff, alpha: 0.16, width: 1 });
    this.background.visible = true;

    this.root.position.set(x, y);
    this.speaker.position.set(PADDING, speakerY);
    this.body.position.set(PADDING, bodyY);
    this.hint.position.set(PADDING, hasBody ? bodyY + this.body.height + 14 : bodyY);
  }

  /** Every reply is on screen. The highlighted one wears the red bar. */
  private layoutChoices(): void {
    this.speaker.visible = false;
    this.body.visible = false;
    this.hint.visible = false;
    this.background.visible = false;
    this.background.clear();

    const width = Math.min(CHOICE_WIDTH, Math.max(320, this.viewWidth - 160));
    const gap = 22;
    let cursor = 0;
    this.choiceRows.forEach((row, index) => {
      cursor += layoutChoice(row, width, cursor, index === this.selectedChoice) + gap;
    });
    const height = Math.max(0, cursor - gap);
    this.root.position.set((this.viewWidth - width) / 2, (this.viewHeight - height) / 2);
  }
}

function createChoice(label: string, index: number): Container {
  const row = new Container();
  row.label = `choice-${index}`;
  const plate = new Graphics();
  const text = new Text({
    text: label.toLocaleUpperCase('en-US'),
    style: {
      fill: '#ffffff',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 18,
      letterSpacing: 0.6,
      wordWrap: true,
      wordWrapWidth: 400,
    },
  });
  row.addChild(plate, text);
  return row;
}

function layoutChoice(row: Container, width: number, y: number, selected: boolean): number {
  const plate = row.getChildAt(0);
  const text = row.getChildAt(1);
  if (!(plate instanceof Graphics) || !(text instanceof Text)) {
    return 0;
  }
  const textX = 36;
  text.style.wordWrapWidth = width - textX - 16;
  const height = Math.max(46, text.height + 16);
  plate.clear();
  plate.rect(0, 0, width, height).fill({ color: CHOICE_RED, alpha: selected ? 1 : 0 });
  if (selected) {
    const mid = height / 2;
    plate.poly([14, mid - 7, 14, mid + 7, 26, mid]).fill(0xffffff);
  }
  text.position.set(textX, (height - text.height) / 2);
  row.position.set(0, y);
  return height;
}
