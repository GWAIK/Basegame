export type ShopKind = 'decor' | 'map';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  /** Coins. 0 means it comes with the room. */
  price: number;
  blurb: string;
}

/** Decor for the study, then maps you can unlock. */
export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'ceramic-mug', kind: 'decor', name: 'Ceramic mug', price: 40, blurb: 'A warm cup for the desk.' },
  { id: 'desk-plant', kind: 'decor', name: 'Desk plant', price: 60, blurb: 'A small green neighbor.' },
  { id: 'paper-stack', kind: 'decor', name: 'Paper stack', price: 50, blurb: 'Notes, sketches, loose pages.' },
  { id: 'string-lights', kind: 'decor', name: 'String lights', price: 110, blurb: 'A soft glow along the wall.' },
  { id: 'day-study', kind: 'map', name: 'Day study', price: 0, blurb: 'The room you already know.' },
  { id: 'night-study', kind: 'map', name: 'Night study', price: 150, blurb: 'The same desk, after dark.' },
  { id: 'rainy-window', kind: 'map', name: 'Rainy window', price: 180, blurb: 'Glass, weather, and quiet.' },
  { id: 'rooftop', kind: 'map', name: 'Rooftop', price: 220, blurb: 'Open air above the street.' },
];

export const STARTER_OWNED = ['day-study'] as const;

export function shopItem(id: string): ShopItem | null {
  return SHOP_ITEMS.find((item) => item.id === id) ?? null;
}
