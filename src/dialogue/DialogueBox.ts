import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { DIALOGUE_CONFIG } from './DialogueConfig';

const CHOICE_WIDTH = 820;
const CHOICE_RED = 0xb01e2c;
const NAME_GAP = 10;
const TEXT_GAP = 12;

/**
 * Screen-space dialogue. Parent it to the UI layer, not the camera world.
 * A spoken line is a portrait, a name, a rule, and the text, with no plate behind the words.
 * Choices stay as their own list. The game hit-tests them from the click position.
 */
export class DialogueBox {
  private readonly root = new Container();
  private readonly portrait = new Container();
  private readonly portraitFrame = new Graphics();
  private readonly portraitMask = new Graphics();
  private readonly portraitSprite = new Sprite(Texture.EMPTY);
  private readonly rule = new Graphics();
  private readonly speaker: Text;
  private readonly body: Text;
  private readonly choiceRows: Container[] = [];
  private selectedChoice = 0;
  private portraitKey = '';
  private viewWidth = 800;
  private viewHeight = 600;

  constructor(ui: Container) {
    this.speaker = new Text({
      text: '',
      style: {
        fill: '#f0b429',
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontStyle: 'italic',
        fontWeight: 'bold',
        fontSize: DIALOGUE_CONFIG.nameSize,
      },
    });

    this.body = new Text({
      text: '',
      style: {
        fill: '#ffffff',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: DIALOGUE_CONFIG.textSize,
        wordWrap: true,
        wordWrapWidth: 400,
      },
    });

    this.portraitSprite.anchor.set(0.5);
    this.portraitSprite.visible = false;
    this.portraitSprite.mask = this.portraitMask;
    this.portrait.addChild(this.portraitFrame, this.portraitSprite, this.portraitMask);
    this.portrait.visible = false;
    this.portrait.eventMode = 'none';

    this.root.addChild(this.portrait, this.speaker, this.rule, this.body);
    this.root.visible = false;
    this.root.eventMode = 'none';
    ui.addChild(this.root);
  }

  /**
   * Fills the square for the line currently on screen.
   * A late load for a previous speaker is ignored.
   */
  setPortrait(speaker: string, texture: Texture | null): void {
    if (speaker.trim().toLowerCase() !== this.portraitKey) {
      return;
    }
    this.portraitSprite.texture = texture ?? Texture.EMPTY;
    this.portraitSprite.visible = texture !== null;
    if (this.root.visible) {
      this.layout();
    }
  }

  show(speaker: string, text: string): void {
    this.clearChoices();
    const key = speaker.trim().toLowerCase();
    if (key !== this.portraitKey) {
      this.portraitKey = key;
      this.portraitSprite.texture = Texture.EMPTY;
      this.portraitSprite.visible = false;
    }
    this.speaker.text = speaker.toLocaleUpperCase('en-US');
    this.body.text = text;
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

  /** Reads font, position, and the rule, so the debug panel applies while a line is up. */
  refresh(): void {
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

    this.speaker.style.fontSize = DIALOGUE_CONFIG.nameSize;
    this.body.style.fontSize = DIALOGUE_CONFIG.textSize;
    this.body.style.wordWrapWidth = Math.max(160, DIALOGUE_CONFIG.lineLength);

    const hasSpeaker = this.speaker.text.trim().length > 0;
    this.speaker.visible = hasSpeaker;
    const hasBody = this.body.text.trim().length > 0;
    this.body.visible = hasBody;

    const portraitSize = Math.max(1, DIALOGUE_CONFIG.portraitSize);
    const textX = hasSpeaker ? portraitSize + DIALOGUE_CONFIG.portraitGap : 0;
    const lineLength = Math.max(1, DIALOGUE_CONFIG.lineLength);

    let cursor = 0;
    this.speaker.position.set(textX, 0);
    if (hasSpeaker) {
      cursor = this.speaker.height + NAME_GAP;
    }
    this.rule.clear();
    this.rule.visible = hasSpeaker;
    if (hasSpeaker) {
      const thickness = Math.max(1, DIALOGUE_CONFIG.lineThickness);
      this.rule.rect(textX, cursor, lineLength, thickness).fill(DIALOGUE_CONFIG.lineColor);
      cursor += thickness + TEXT_GAP;
    }
    this.body.position.set(textX, cursor);
    if (hasBody) {
      cursor += this.body.height;
    }

    this.portrait.visible = hasSpeaker;
    if (hasSpeaker) {
      const nameMid = this.speaker.height / 2;
      this.portrait.position.set(0, nameMid - portraitSize / 2 + portraitSize * 0.22);
      this.drawPortrait(portraitSize);
    }

    const boxWidth = textX + lineLength;
    this.root.position.set((this.viewWidth - boxWidth) / 2, this.viewHeight - DIALOGUE_CONFIG.bottom - cursor);
  }

  /** Square plate. A photo, when there is one, is cropped to fill it. */
  private drawPortrait(size: number): void {
    this.portraitFrame.clear();
    this.portraitFrame.rect(0, 0, size, size).fill(0x141414);
    if (!this.portraitSprite.visible) {
      this.portraitFrame.rect(0, 0, size, size).stroke({ width: 1, color: 0x8a8a8a });
    }
    this.portraitMask.clear();
    this.portraitMask.rect(0, 0, size, size).fill(0xffffff);

    const texture = this.portraitSprite.texture;
    if (!this.portraitSprite.visible || texture === Texture.EMPTY || texture.width <= 0 || texture.height <= 0) {
      return;
    }
    const scale = Math.max(size / texture.width, size / texture.height);
    this.portraitSprite.scale.set(scale);
    this.portraitSprite.position.set(size / 2, size / 2);
  }

  /** Every reply is on screen. The highlighted one wears the red bar. */
  private layoutChoices(): void {
    this.speaker.visible = false;
    this.body.visible = false;
    this.rule.visible = false;
    this.rule.clear();
    this.portrait.visible = false;

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
