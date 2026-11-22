import { createLockState, fitsLock, type LockState } from './lockLogic';
import type { LockDef } from './types';

/**
 * Wheel positions and solved flags for every lock, for this launch.
 * A key names one lock across the whole game, such as "level-sandbox-lock/door".
 * Nothing is kept after a reload, like the rest of the progression. A save will come later.
 */
export class LockStore {
  private readonly states = new Map<string, LockState>();

  /** The saved state, or a fresh one the first time. The panel edits it in place. */
  state(key: string, def: LockDef): LockState {
    const saved = this.states.get(key);
    if (saved && (saved.solved || fitsLock(def, saved))) {
      return saved;
    }
    const fresh = createLockState(def);
    this.states.set(key, fresh);
    return fresh;
  }

  /** A solved lock never opens again. */
  isSolved(key: string): boolean {
    return this.states.get(key)?.solved === true;
  }

  /** Dev tool. Forgets every lock, solved or not. */
  reset(): void {
    this.states.clear();
  }
}
