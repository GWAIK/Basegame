/**
 * x and y are pixels on the background image, so a character stays on the same
 * spot in the picture whatever the window size. scale is relative to that image.
 * Animated WebP files loop automatically.
 */
export interface LevelCharacter {
  file: string;
  x: number;
  y: number;
  scale?: number;
}

export interface LevelDefinition {
  id: string;
  sceneBackground: string;
  characters: readonly LevelCharacter[];
}

/**
 * Level 1 is one scene for now.
 * Its images live in public/assets/levels/level-1/.
 * A later level is another folder plus a definition like this one.
 */
export const LEVEL_1: LevelDefinition = {
  id: 'level-1',
  sceneBackground: 'BG1_test.webp',
  characters: [
    { file: 'ticket.webp', x: 640, y: 300, scale: 0.45 },
  ],
};

export function levelAssetPath(
  levelId: string,
  folder: 'backgrounds' | 'characters' | 'foreground',
  filename: string,
): string {
  return `/assets/levels/${levelId}/${folder}/${filename}`;
}
