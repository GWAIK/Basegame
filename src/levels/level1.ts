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

/**
 * cover fills the view and crops the overflow.
 * contain keeps the whole image visible, at a uniform scale.
 */
export type SceneFit = 'cover' | 'contain';

export interface LevelScene {
  id: string;
  label: string;
  fit: SceneFit;
  background: string;
  characters: readonly LevelCharacter[];
}

export interface LevelDefinition {
  id: string;
  defaultSceneId: string;
  scenes: readonly LevelScene[];
}

/**
 * Level 1 scenes.
 * Images live in public/assets/levels/level-1/.
 */
export const LEVEL_1: LevelDefinition = {
  id: 'level-1',
  defaultSceneId: 'hana',
  scenes: [
    {
      id: 'test',
      label: 'Test',
      fit: 'cover',
      background: 'BG1_test.webp',
      characters: [
        { file: 'ticket.webp', x: 640, y: 300, scale: 0.45 },
      ],
    },
    {
      id: 'hana',
      label: 'Hana',
      fit: 'contain',
      background: 'hana.webp',
      characters: [],
    },
  ],
};

export function findScene(level: LevelDefinition, sceneId: string): LevelScene {
  return level.scenes.find((scene) => scene.id === sceneId) ?? level.scenes[0];
}

export function levelAssetPath(
  levelId: string,
  folder: 'backgrounds' | 'characters' | 'foreground',
  filename: string,
): string {
  return `/assets/levels/${levelId}/${folder}/${filename}`;
}
