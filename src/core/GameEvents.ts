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
  /** A lock panel opened. lockId is its key under "locks" in level.json. */
  'lock:open': LockLocation;
  /**
   * A lock was solved and its panel has closed. Fires once per lock.
   * Open a door, play an animation, or move the story on from here.
   */
  'lock:solved': LockLocation;
  /** A lock panel closed, solved or not. The wheels are kept for the next visit. */
  'lock:close': LockLocation & { solved: boolean };
}

export interface LockLocation {
  levelId: string;
  lockId: string;
}
