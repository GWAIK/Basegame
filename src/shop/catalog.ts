export type ShopKind = 'special' | 'decor' | 'map';

export const WIRELESS_MOUSE_ID = 'wireless-mouse';
export const NIGHT_STUDY_ID = 'night-study';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  /** Coins. 0 means it comes with the room. */
  price: number;
  blurb: string;
}

/** Special items and maps. Decor is empty for now; the shop shows Coming soon. */
export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: WIRELESS_MOUSE_ID,
    kind: 'special',
    name: 'Wireless mouse',
    price: 10,
    blurb: 'Special item. Lets you interact with the world.',
  },
  { id: 'day-study', kind: 'map', name: 'Day study', price: 0, blurb: 'The room you already know.' },
  { id: NIGHT_STUDY_ID, kind: 'map', name: 'Night study', price: 20, blurb: 'The same desk, after dark.' },
  { id: 'rainy-window', kind: 'map', name: 'Rainy window', price: 180, blurb: 'Glass, weather, and quiet.' },
  { id: 'rooftop', kind: 'map', name: 'Rooftop', price: 220, blurb: 'Open air above the street.' },
];

export const STARTER_OWNED = ['day-study'] as const;

export function shopItem(id: string): ShopItem | null {
  return SHOP_ITEMS.find((item) => item.id === id) ?? null;
}
