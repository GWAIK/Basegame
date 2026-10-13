/**
 * cover fills the view and crops the overflow.
 * contain keeps the whole image visible, at a uniform scale.
 */
export type SceneFit = 'cover' | 'contain';

/** x and y are the character's center, in pixels of the background image. */
export interface CharacterDef {
  image: string;
  x: number;
  y: number;
  scale: number;
}

export interface SceneDef {
  id: string;
  name: string;
  fit: SceneFit;
  background: string | null;
  characters: readonly CharacterDef[];
  /** Played when the scene opens. */
  dialogue: string | null;
}

export interface LevelDef {
  /** The level folder name. */
  id: string;
  name: string;
  startScene: string;
  scenes: readonly SceneDef[];
}

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DialogueDef {
  /** The file name, without .json. */
  id: string;
  lines: readonly DialogueLine[];
}
