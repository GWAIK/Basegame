export interface SceneLocation {
  levelId: string;
  sceneId: string;
}

/**
 * Everything a feature can listen to with game.events.on().
 * Add a new event here first, then emit it where it happens.
 */
export interface GameEvents {
  update: { deltaMS: number };
  resize: { width: number; height: number };
  'scene:enter': SceneLocation;
  'scene:exit': SceneLocation;
  'dialogue:start': { dialogueId: string };
  'dialogue:end': { dialogueId: string };
  /** A choice tag `# event: name`. The game decides what that name does. */
  'dialogue:event': { name: string };
}
