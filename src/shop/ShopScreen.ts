import { Container, Graphics, Text } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';
import { SHOP_ITEMS, type ShopItem, type ShopKind } from './catalog';
import type { Wallet } from './Wallet';

const INK = 0x4a372d;
const CREAM = 0xfffbf7;
const TERRACOTTA = 0xd97757;
const LINE = 0xe6d6c5;

interface Hit {
  id: 'close' | string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The menu shop, drawn inside the square frame.
 * A coin chip stays on the menu. Opening the shop lists decor and maps.
 */
export class ShopScreen {
  readonly root = new Container({ label: 'shop' });
  onPurchase: ((itemId: string, bought: boolean) => void) | null = null;

  private readonly wallet: Wallet;
  private open = false;
  private onMenu = false;
  private side = 1;
  private hover: string | null = null;
  private scroll = 0;
  private maxScroll = 0;
  private listTop = 0;
  private listHeight = 0;
  private listX = 0;
  private readonly hits: Hit[] = [];
  private faceKey = '';

  constructor(wallet: Wallet) {
    this.wallet = wallet;
    wallet.onChange = () => {
      this.faceKey = '';
      this.draw();
    };
    this.root.visible = false;
  }

  get isOpen(): boolean {
    return this.open;
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    this.faceKey = '';
    this.draw();
  }

  /** The coin chip is only for the menu. Leaving the menu also closes the shop. */
  setOnMenu(onMenu: boolean): void {
    this.onMenu = onMenu;
    if (!onMenu) {
      this.open = false;
      this.scroll = 0;
    }
    this.faceKey = '';
    this.draw();
  }

  openShop(): void {
    if (!this.onMenu) {
      return;
    }
    this.open = true;
    this.scroll = 0;
    this.faceKey = '';
    this.draw();
  }

  close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.hover = null;
    this.scroll = 0;
    this.faceKey = '';
    this.draw();
  }

  /** Screen point inside the frame. */
  hoverAt(x: number, y: number): boolean {
    const next = this.hitAt(x, y);
    if (next !== this.hover) {
      this.hover = next;
      this.faceKey = '';
      this.draw();
    }
    return next !== null;
  }

  pointerDown(x: number, y: number): void {
    const id = this.hitAt(x, y);
    if (id === 'close') {
      this.close();
      return;
    }
    if (!id) {
      return;
    }
    const bought = this.wallet.buy(id);
    this.onPurchase?.(id, bought);
  }

  wheel(deltaY: number): void {
    if (!this.open || this.maxScroll <= 0) {
      return;
    }
    this.scroll = clamp(this.scroll + deltaY * 0.4, 0, this.maxScroll);
    this.faceKey = '';
    this.draw();
  }

  private hitAt(x: number, y: number): string | null {
    for (const hit of this.hits) {
      if (x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) {
        return hit.id;
      }
    }
    return null;
  }

  private draw(): void {
    this.root.visible = this.onMenu;
    if (!this.onMenu) {
      return;
    }
    const key = [
      this.open ? 'open' : 'chip',
      this.side,
      this.wallet.coins,
      this.hover ?? '',
      this.scroll.toFixed(1),
      SHOP_ITEMS.map((item) => (this.wallet.owns(item.id) ? '1' : '0')).join(''),
    ].join('|');
    if (key === this.faceKey) {
      return;
    }
    this.faceKey = key;
    this.hits.length = 0;
    this.root.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (this.open) {
      this.drawShop();
      return;
    }
    this.drawChip(this.side - 28, 36);
  }

  private drawChip(right: number, top: number): void {
    const label = coinLabel(this.wallet.coins, 22);
    const width = label.width + 36;
    const height = 36;
    const x = right - width;
    const plate = new Graphics();
    plate.roundRect(x, top, width, height, 18).fill({ color: CREAM }).stroke({ color: LINE, width: 2 });
    drawCoin(plate, x + 16, top + height / 2, 7);
    label.position.set(x + 28, top + height / 2);
    this.root.addChild(plate, label);
  }

  private drawShop(): void {
    const pad = 22;
    const panel = new Graphics();
    panel.roundRect(pad, pad, this.side - pad * 2, this.side - pad * 2, 28).fill({ color: CREAM });
    this.root.addChild(panel);

    const title = new Text({
      text: 'Shop',
      style: { fill: '#4a372d', fontFamily: GAME_FONTS.display, fontWeight: '700', fontSize: 36 },
    });
    title.position.set(pad + 22, pad + 16);
    this.root.addChild(title);

    const coins = coinLabel(this.wallet.coins, 20);
    coins.anchor.set(1, 0);
    coins.position.set(this.side - pad - 62, pad + 24);
    const coinMark = new Graphics();
    drawCoin(coinMark, this.side - pad - 62 - coins.width - 16, pad + 36, 7);
    this.root.addChild(coinMark, coins);

    const closeSize = 36;
    const closeX = this.side - pad - 18 - closeSize;
    const closeY = pad + 16;
    const close = new Graphics();
    const hot = this.hover === 'close';
    close.roundRect(closeX, closeY, closeSize, closeSize, 18).fill({ color: hot ? 0xefe3d5 : 0xf7efe6 }).stroke({
      color: hot ? TERRACOTTA : LINE,
      width: 2,
    });
    close
      .moveTo(closeX + 12, closeY + 12)
      .lineTo(closeX + closeSize - 12, closeY + closeSize - 12)
      .moveTo(closeX + closeSize - 12, closeY + 12)
      .lineTo(closeX + 12, closeY + closeSize - 12)
      .stroke({ color: INK, width: 2, cap: 'round' });
    this.root.addChild(close);
    this.hits.push({ id: 'close', x: closeX, y: closeY, width: closeSize, height: closeSize });

    this.listTop = pad + 72;
    this.listX = pad + 16;
    this.listHeight = this.side - pad - 16 - this.listTop;
    const content = new Container();
    content.position.set(pad + 16, this.listTop - this.scroll);
    let cursor = 0;
    cursor = this.addSection(content, 'Special', 'special', cursor, pad);
    cursor = this.addSection(content, 'Decor', 'decor', cursor + 4, pad);
    cursor = this.addSection(content, 'Maps', 'map', cursor + 4, pad);
    const mask = new Graphics();
    mask.rect(pad + 8, this.listTop, this.side - pad * 2 - 16, this.listHeight).fill(0xffffff);
    content.mask = mask;
    this.root.addChild(mask, content);
    this.maxScroll = Math.max(0, cursor - this.listHeight);
    this.scroll = clamp(this.scroll, 0, this.maxScroll);
  }

  private addSection(content: Container, title: string, kind: ShopKind, y: number, pad: number): number {
    const heading = new Text({
      text: title,
      style: { fill: '#a89280', fontFamily: GAME_FONTS.cozy, fontWeight: '700', fontSize: 16, letterSpacing: 1.2 },
    });
    heading.position.set(8, y);
    content.addChild(heading);
    let cursor = y + 24;
    const rowWidth = this.side - pad * 2 - 32;
    const items = SHOP_ITEMS.filter((entry) => entry.kind === kind);
    if (items.length === 0) {
      this.addComingSoon(content, cursor, rowWidth);
      return cursor + 58;
    }
    for (const item of items) {
      this.addRow(content, item, cursor, rowWidth);
      cursor += 58;
    }
    return cursor;
  }

  private addComingSoon(content: Container, y: number, width: number): void {
    const row = new Graphics();
    row.roundRect(0, y, width, 52, 14).fill({ color: 0xf7efe6 }).stroke({ color: LINE, width: 1.5 });
    const label = new Text({
      text: 'Coming soon',
      style: { fill: '#a89280', fontFamily: GAME_FONTS.cozy, fontWeight: '600', fontSize: 16 },
    });
    label.anchor.set(0.5);
    label.position.set(width / 2, y + 26);
    content.addChild(row, label);
  }

  private addRow(content: Container, item: ShopItem, y: number, width: number): void {
    const owned = this.wallet.owns(item.id);
    const affordable = this.wallet.coins >= item.price;
    const hot = this.hover === item.id;
    const row = new Graphics();
    row.roundRect(0, y, width, 52, 14).fill({ color: hot && !owned ? 0xf7efe6 : 0xfffbf7 }).stroke({
      color: LINE,
      width: 1.5,
    });
    const name = new Text({
      text: item.name,
      style: { fill: '#4a372d', fontFamily: GAME_FONTS.cozy, fontWeight: '700', fontSize: 18 },
    });
    name.position.set(16, y + 6);
    const blurb = new Text({
      text: item.blurb,
      style: { fill: '#a89280', fontFamily: GAME_FONTS.cozy, fontWeight: '600', fontSize: 13 },
    });
    blurb.position.set(16, y + 26);
    content.addChild(row, name, blurb);

    const buttonW = 92;
    const buttonH = 32;
    const buttonX = width - buttonW - 12;
    const buttonY = y + 10;
    const button = new Graphics();
    if (owned) {
      button.roundRect(buttonX, buttonY, buttonW, buttonH, 16).fill({ color: 0xf3ebe3 });
    } else if (affordable) {
      button.roundRect(buttonX, buttonY, buttonW, buttonH, 16).fill({ color: hot ? 0xc86646 : TERRACOTTA });
    } else {
      button.roundRect(buttonX, buttonY, buttonW, buttonH, 16).fill({ color: 0xefe4da });
    }
    const caption = new Text({
      text: owned ? 'Owned' : `${item.price}`,
      anchor: 0.5,
      style: {
        fill: owned ? '#a89280' : affordable ? '#fffaf5' : '#c4b2a4',
        fontFamily: GAME_FONTS.cozy,
        fontWeight: '700',
        fontSize: 15,
      },
    });
    caption.position.set(buttonX + buttonW / 2, buttonY + buttonH / 2);
    content.addChild(button, caption);
    if (!owned) {
      const screenY = this.listTop - this.scroll + buttonY;
      if (screenY + buttonH >= this.listTop && screenY <= this.listTop + this.listHeight) {
        this.hits.push({
          id: item.id,
          x: this.listX + buttonX,
          y: screenY,
          width: buttonW,
          height: buttonH,
        });
      }
    }
  }
}

function coinLabel(coins: number, size: number): Text {
  const label = new Text({
    text: `${coins}`,
    anchor: { x: 0, y: 0.5 },
    style: {
      fill: '#4a372d',
      fontFamily: GAME_FONTS.cozy,
      fontWeight: '700',
      fontSize: size,
    },
  });
  return label;
}

function drawCoin(graphics: Graphics, x: number, y: number, radius: number): void {
  graphics.circle(x, y, radius).fill({ color: TERRACOTTA });
  graphics.circle(x, y, radius * 0.45).fill({ color: 0xfff3ea });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
