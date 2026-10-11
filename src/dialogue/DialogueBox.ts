import { Container, Graphics, Text } from 'pixi.js';

const MARGIN = 28;
const MAX_WIDTH = 720;
const PADDING = 18;

/**
 * Screen-space dialogue panel. Parent it to the UI layer, not the camera world.
 */
export class DialogueBox {
  private readonly root = new Container();
  private readonly background = new Graphics();
  private readonly speaker: Text;
  private readonly body: Text;
  private readonly hint: Text;
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
    ui.addChild(this.root);
  }

  show(speaker: string, text: string): void {
    this.speaker.text = speaker;
    this.body.text = text;
    this.root.visible = true;
    this.layout();
  }

  hide(): void {
    this.root.visible = false;
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    if (this.root.visible) {
      this.layout();
    }
  }

  private layout(): void {
    const width = Math.min(MAX_WIDTH, Math.max(280, this.viewWidth - MARGIN * 2));
    this.body.style.wordWrapWidth = width - PADDING * 2;

    const speakerY = PADDING;
    const bodyY = speakerY + this.speaker.height + 8;
    const hintY = bodyY + this.body.height + 14;
    const height = hintY + this.hint.height + PADDING;
    const x = (this.viewWidth - width) / 2;
    const y = this.viewHeight - height - MARGIN;

    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 8)
      .fill({ color: 0x0c0e14, alpha: 0.9 })
      .stroke({ color: 0xffffff, alpha: 0.16, width: 1 });

    this.root.position.set(x, y);
    this.speaker.position.set(PADDING, speakerY);
    this.body.position.set(PADDING, bodyY);
    this.hint.position.set(PADDING, hintY);
  }
}
