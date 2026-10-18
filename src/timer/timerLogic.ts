/**
 * How a level's clock behaves. The display only shows what this returns.
 * Give a level its own object when its rule stops being the shared minute.
 */
export interface TimerLogic {
  /** Seconds shown when the level opens. */
  startSeconds: number;
  /** Called once per elapsed second. Return the new remaining time. */
  tick(remaining: number): number;
}

/** 01:00, then one second less, and it stays on 00:00. */
export const oneMinuteCountdown: TimerLogic = {
  startSeconds: 60,
  tick(remaining) {
    return Math.max(0, remaining - 1);
  },
};

/**
 * Level folder name to clock. Null hides the clock on that level.
 * Levels absent from this map use the one-minute countdown.
 */
const LEVEL_TIMERS: Record<string, TimerLogic | null> = {
  menu: null,
};

export function timerLogicFor(levelId: string): TimerLogic | null {
  if (levelId in LEVEL_TIMERS) {
    return LEVEL_TIMERS[levelId] ?? null;
  }
  return oneMinuteCountdown;
}
