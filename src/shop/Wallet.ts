import { STARTER_OWNED, shopItem } from './catalog';

const START_COINS = 0;

/**
 * Coins and unlocked shop items for this launch.
 * Nothing is kept after a reload. A save will come later.
 */
export class Wallet {
  coins = START_COINS;
  private readonly owned = new Set<string>(STARTER_OWNED);
  onChange: (() => void) | null = null;

  constructor() {
    try {
      localStorage.removeItem('focus-iris-wallet');
    } catch {
      // Storage may be unavailable. This launch still starts from zero.
    }
  }

  owns(id: string): boolean {
    return this.owned.has(id);
  }

  canAfford(id: string): boolean {
    const item = shopItem(id);
    return item !== null && !this.owns(id) && this.coins >= item.price;
  }

  /** Adds coins from a reward. */
  earn(amount: number): void {
    const gained = Math.floor(amount);
    if (gained <= 0) {
      return;
    }
    this.coins += gained;
    this.onChange?.();
  }

  /** Pays the price and keeps the item. False when it is already owned or too expensive. */
  buy(id: string): boolean {
    const item = shopItem(id);
    if (!item || this.owns(id) || this.coins < item.price) {
      return false;
    }
    this.coins -= item.price;
    this.owned.add(id);
    this.onChange?.();
    return true;
  }
}
