const FOCUS_LEVELS = ['level-0', 'level-1', 'level-2', 'level-3'] as const;

/**
 * Shared progression for this launch only.
 * A reload returns to level 0, with the shop locked.
 * A save will come later.
 */
export class Progression {
  day = 0;
  shopUnlocked = false;
  mouseOwned = false;
  nightStudyOwned = false;

  constructor() {
    try {
      localStorage.removeItem('focus-iris-progression');
    } catch {
      // Storage may be unavailable. This launch still starts from zero.
    }
  }

  /** Level opened by Start Focus on the menu. */
  get focusLevelId(): string {
    if (!this.mouseOwned) {
      return 'level-0';
    }
    const cap = this.nightStudyOwned ? FOCUS_LEVELS.length - 1 : 2;
    const index = Math.min(Math.max(this.day, 1), cap);
    return FOCUS_LEVELS[index] ?? 'level-1';
  }

  /** After level 2, Start Focus waits for Night study. */
  get needsNightStudy(): boolean {
    return this.day >= 3 && !this.nightStudyOwned;
  }

  /** Records a finished focus countdown. Returns true the first time the shop unlocks. */
  completeDay(): boolean {
    const unlockedNow = !this.shopUnlocked;
    this.day += 1;
    this.shopUnlocked = true;
    return unlockedNow;
  }

  /** The wireless mouse is what lets Start Focus open level 1. */
  unlockMouse(): void {
    this.mouseOwned = true;
  }

  /** Night study is what lets Start Focus open level 3. */
  unlockNightStudy(): void {
    this.nightStudyOwned = true;
  }
}
