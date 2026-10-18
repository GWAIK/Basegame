import type { PopupMessage } from './Popup';

/** Coins given when a focus day ends and the menu comes back. */
export const DAY_COINS = 10;

export function dayCompleteMessage(unlockedShop = true): PopupMessage {
  return {
    text: unlockedShop
      ? `You got ${DAY_COINS} coins. The shop is now available.`
      : `You got ${DAY_COINS} coins.`,
  };
}

/** Shown when Start Focus is pressed after level 0, before the wireless mouse is bought. */
export function buyInShopFirstMessage(): PopupMessage {
  return {
    text: 'Try buying something in the shop first.',
  };
}
