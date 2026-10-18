import { TIMER_DRAIN_COLOR, TIMER_DRAIN_STEP_MS } from './TimerConfig';

/**
 * How a level's clock behaves. The display only shows what this returns.
 * Give a level its own object when its rule stops being the shared minute.
 */
export interface TimerLogic {
  /** Seconds shown when the level opens. */
  startSeconds: number;
  /** Called once per elapsed second. Return the new remaining time. */
  tick(remaining: number): number;
  /** Milliseconds between each shown second. Default 1000. */
  stepMS?: number;
  color?: string;
  size?: number;
  /** Center of the frame, or the usual top-right corner. */
  place?: 'center' | 'corner';
}

/** 01:00, then one second less, and it stays on 00:00. */
export const oneMinuteCountdown: TimerLogic = {
  startSeconds: 60,
  tick(remaining) {
    return Math.max(0, remaining - 1);
  },
};

/** Huge red clock in the middle, racing the same way as the level 1 kick-out. */
const racingCenter: TimerLogic = {
  startSeconds: 60,
  tick: oneMinuteCountdown.tick,
  stepMS: TIMER_DRAIN_STEP_MS,
  color: TIMER_DRAIN_COLOR,
  size: 164,
  place: 'center',
};

/**
 * Level folder name to clock. Null hides the clock on that level.
 * Levels absent from this map use the one-minute countdown.
 */
const LEVEL_TIMERS: Record<string, TimerLogic | null> = {
  menu: null,
  'level-2': racingCenter,
};

export function timerLogicFor(levelId: string): TimerLogic | null {
  if (levelId in LEVEL_TIMERS) {
    return LEVEL_TIMERS[levelId] ?? null;
  }
  return oneMinuteCountdown;
}
