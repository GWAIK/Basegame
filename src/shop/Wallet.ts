import { SHOP_ITEMS, STARTER_OWNED, shopItem } from './catalog';

const STORAGE_KEY = 'focus-iris-wallet';
const START_COINS = 120;

interface SavedWallet {
  coins: number;
  owned: string[];
}

/**
 * Coins and unlocked shop items. Saved in the browser so a purchase stays.
 */
export class Wallet {
  coins = START_COINS;
  private readonly owned = new Set<string>(STARTER_OWNED);
  onChange: (() => void) | null = null;

  constructor() {
    this.load();
  }

  owns(id: string): boolean {
    return this.owned.has(id);
  }

  canAfford(id: string): boolean {
    const item = shopItem(id);
    return item !== null && !this.owns(id) && this.coins >= item.price;
  }

  /** Pays the price and keeps the item. False when it is already owned or too expensive. */
  buy(id: string): boolean {
    const item = shopItem(id);
    if (!item || this.owns(id) || this.coins < item.price) {
      return false;
    }
    this.coins -= item.price;
    this.owned.add(id);
    this.save();
    this.onChange?.();
    return true;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw) as Partial<SavedWallet>;
      if (typeof saved.coins === 'number' && saved.coins >= 0) {
        this.coins = Math.floor(saved.coins);
      }
      this.owned.clear();
      for (const id of STARTER_OWNED) {
        this.owned.add(id);
      }
      if (Array.isArray(saved.owned)) {
        for (const id of saved.owned) {
          if (SHOP_ITEMS.some((item) => item.id === id)) {
            this.owned.add(id);
          }
        }
      }
    } catch {
      this.coins = START_COINS;
    }
  }

  private save(): void {
    const payload: SavedWallet = {
      coins: this.coins,
      owned: [...this.owned],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }
}
