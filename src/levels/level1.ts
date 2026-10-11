/**
 * Level 1 is one scene for now.
 * Drop the scene photo at public/assets/levels/level-1/backgrounds/scene.webp.
 * A later level is another folder plus a definition like this one.
 */
export const LEVEL_1 = {
  id: 'level-1',
  sceneBackground: 'scene.webp',
} as const;

export function levelAssetPath(
  levelId: string,
  folder: 'backgrounds' | 'characters' | 'foreground',
  filename: string,
): string {
  return `/assets/levels/${levelId}/${folder}/${filename}`;
}
