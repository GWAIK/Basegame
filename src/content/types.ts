import type { LockDef } from '../lock/types';

/**
 * width stretches the image to the left and right edges and crops the top and bottom.
 * height stretches it to the top and bottom edges and crops the sides.
 * cover fills the view and crops whichever side overflows.
 * contain keeps the whole image visible, at a uniform scale.
 */
export type SceneFit = 'width' | 'height' | 'cover' | 'contain';

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
 * go, level, and quit end the list. dev toggles the debug tools.
 * fullscreen switches between the window and the whole screen.
 * shop opens the menu shop.
 * focus opens the black minute screen, then a short monologue, then the level.
 * lock opens that combination lock of the level, then ends the list. A solved lock does nothing.
 */
export type ActionDef =
  | { type: 'sound'; file: string; volume: number }
  | { type: 'dialogue'; id: string }
  | { type: 'go'; sceneId: string }
  | { type: 'level'; levelId: string }
  | { type: 'shake'; intensity: number; durationMs: number }
  | { type: 'quit' }
  | { type: 'dev' }
  | { type: 'fullscreen' }
  | { type: 'shop' }
  | { type: 'focus' }
  | { type: 'lock'; lockId: string };

/**
 * A click box. x and y are its center, in pixels of the background.
 * A click runs its actions. A label draws a button; without one the box stays invisible.
 * once removes the box after that click. The debug panel can draw every box.
 */
export interface TriggerDef {
  id: string;
  /** Drawn as a button. Null keeps the box invisible. */
  label: string | null;
  /** True removes the box after it runs. False leaves it in place. */
  once: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  actions: readonly ActionDef[];
}

/** A line of text placed on a scene. x and y are its center, in pixels of the background. */
export interface TextDef {
  text: string;
  x: number;
  y: number;
  size: number;
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
  texts: readonly TextDef[];
  /** False holds the camera still, so a menu does not slide under the pointer. */
  look: boolean;
}

/** A lock placed in a level. onSolved runs once the solved panel has closed. */
export interface LevelLockDef extends LockDef {
  onSolved: readonly ActionDef[];
}

export interface LevelDef {
  /** The level folder name. */
  id: string;
  name: string;
  startScene: string;
  /** Looping bed for every scene that does not set its own. */
  ambience: AudioCue | null;
  scenes: readonly SceneDef[];
  /** Combination locks a trigger can open with { "lock": "id" }. */
  locks: readonly LevelLockDef[];
}

