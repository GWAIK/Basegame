import { Container, Graphics, Text } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';

/**
 * Covers the frame while the game decodes its images and sounds.
 * The menu is not shown until this screen is removed.
 */
export class LoadingScreen {
  readonly root = new Container({ label: 'loading' });

  private readonly cover = new Graphics();
  private readonly title: Text;
  private readonly count: Text;
  private side = 1;

  constructor() {
    this.title = new Text({
      text: 'Loading',
      anchor: 0.5,
      style: {
        fill: '#f4f1ea',
        fontFamily: GAME_FONTS.display,
        fontWeight: '700',
        fontSize: 42,
      },
    });
    this.count = new Text({
      text: '',
      anchor: 0.5,
      style: {
        fill: '#f4f1ea',
        fontFamily: GAME_FONTS.mono,
        fontWeight: '500',
        fontSize: 22,
      },
    });
    this.root.addChild(this.cover, this.title, this.count);
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    this.cover.clear();
    this.cover.rect(0, 0, this.side, this.side).fill(0x000000);
    this.title.position.set(this.side / 2, this.side / 2 - 18);
    this.count.position.set(this.side / 2, this.side / 2 + 28);
  }

  setProgress(done: number, total: number): void {
    this.count.text = total > 0 ? `${done} / ${total}` : '';
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
