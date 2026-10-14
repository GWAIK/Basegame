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

/** A looping bed. Volume is from 0 to 1. */
export interface AudioCue {
  file: string;
  volume: number;
}

/**
 * One step a scene or a trigger can run.
 * sound starts and does not wait. dialogue waits until it closes.
 * go opens another scene of the same level and ends the list.
 */
export type ActionDef =
  | { type: 'sound'; file: string; volume: number }
  | { type: 'dialogue'; id: string }
  | { type: 'go'; sceneId: string }
  | { type: 'shake'; intensity: number; durationMs: number };

/**
 * An invisible box. x and y are its center, in pixels of the background.
 * A click runs its actions. The debug panel can draw the box.
 */
export interface TriggerDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actions: readonly ActionDef[];
}

export interface SceneDef {
  id: string;
  name: string;
  fit: SceneFit;
  background: string | null;
  characters: readonly CharacterDef[];
  /** Played when the scene opens, before onEnter. */
  dialogue: string | null;
  /** Replaces the level ambience while this scene is open. */
  ambience: AudioCue | null;
  onEnter: readonly ActionDef[];
  triggers: readonly TriggerDef[];
}

export interface LevelDef {
  /** The level folder name. */
  id: string;
  name: string;
  startScene: string;
  /** Looping bed for every scene that does not set its own. */
  ambience: AudioCue | null;
  scenes: readonly SceneDef[];
}

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Path from content/, played when the line appears. */
  audio: string | null;
}

export interface DialogueDef {
  /** The file name, without .json. */
  id: string;
  lines: readonly DialogueLine[];
}
