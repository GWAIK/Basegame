import { Container, Text } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';
import { TIMER_CONFIG } from './TimerConfig';
import { timerLogicFor, type TimerLogic } from './timerLogic';

/**
 * The level clock inside the top-right of the frame.
 * It only draws the time. The rule for a level lives in timerLogic.
 */
export class LevelTimer {
  readonly root = new Container({ label: 'level-timer' });

  private readonly time: Text;
  /** Fires once, when this countdown reaches 00:00. */
  onComplete: (() => void) | null = null;
  /** Fires when the shown time changes. previous is the value before this step. */
  onChange: ((remaining: number, previous: number) => void) | null = null;

  private logic: TimerLogic | null = null;
  private remaining = 0;
  private carry = 0;
  private viewWidth = 0;
  private completed = false;
  /** Debug hold. The clock stays on screen and does not count. */
  private held = false;
  /** Gameplay hold. The clock stays where a story beat stopped it. */
  private stopped = false;
  /** Milliseconds between each second when a beat forces the clock down. */
  private stepMS = 1000;
  private colorOverride: string | null = null;

  constructor() {
    this.time = new Text({
      text: '01:00',
      style: {
        fill: TIMER_CONFIG.color,
        fontFamily: GAME_FONTS.mono,
        fontWeight: '600',
        fontSize: TIMER_CONFIG.size,
        letterSpacing: 1,
      },
    });
    this.time.anchor.set(1, 0);
    this.root.addChild(this.time);
    this.root.visible = false;
  }

  /** Starts this level's clock from the beginning, or hides it on levels without one. */
  enter(levelId: string): void {
    this.logic = timerLogicFor(levelId);
    if (!this.logic) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.remaining = this.logic.startSeconds;
    this.carry = 0;
    this.completed = false;
    this.stopped = false;
    this.stepMS = this.logic.stepMS ?? 1000;
    this.colorOverride = this.logic.color ?? null;
    this.time.text = formatClock(this.remaining);
    this.layout();
  }

  /** Shows or hides the clock without resetting its countdown. */
  setVisible(visible: boolean): void {
    this.root.visible = visible && this.logic !== null;
  }

  get isHeld(): boolean {
    return this.held;
  }

  /** Freezes the countdown. The digits stay where they are. */
  setHeld(held: boolean): void {
    this.held = held;
    if (held) {
      this.carry = 0;
    }
  }

  /** Freezes the countdown for good. A new level starts it again. */
  stop(): void {
    this.stopped = true;
    this.carry = 0;
  }

  /**
   * Pins the clock on a story beat.
   * A stalled frame can jump past the moment; this puts the digits back.
   */
  freezeAt(seconds: number): void {
    this.stopped = true;
    this.carry = 0;
    this.remaining = Math.max(0, seconds);
    this.time.text = formatClock(this.remaining);
  }

  /**
   * Unfreezes the clock, turns the digits to the given color, and runs it down to 00:00.
   * Ignores the debug hold so the beat still finishes if the timer was paused in the dock.
   */
  drainToZero(color: string, stepMS = 65): void {
    if (!this.logic || !this.root.visible) {
      return;
    }
    this.stopped = false;
    this.held = false;
    this.carry = 0;
    this.stepMS = Math.max(16, stepMS);
    this.colorOverride = color;
    this.layout();
  }

  /** Drops the countdown. Reaching 00:00 ends the session the same way a natural finish does. */
  skip(seconds: number): void {
    if (!this.logic || !this.root.visible || this.stopped || this.remaining <= 0) {
      return;
    }
    const previous = this.remaining;
    this.remaining = Math.max(0, this.remaining - seconds);
    this.carry = 0;
    this.time.text = formatClock(this.remaining);
    this.publish(previous);
    if (this.stopped) {
      return;
    }
    if (this.remaining <= 0 && !this.completed) {
      this.completed = true;
      this.onComplete?.();
    }
  }

  /** One second of the clock per second of play. A pause skips this. */
  update(deltaMS: number): void {
    if (!this.logic || !this.root.visible) {
      return;
    }
    this.layout();
    if (this.held || this.stopped || this.remaining <= 0) {
      return;
    }
    this.carry += deltaMS;
    if (this.carry < this.stepMS) {
      return;
    }
    const steps = Math.floor(this.carry / this.stepMS);
    this.carry -= steps * this.stepMS;
    const previous = this.remaining;
    for (let step = 0; step < steps; step += 1) {
      this.remaining = this.logic.tick(this.remaining);
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.carry = 0;
        break;
      }
    }
    this.time.text = formatClock(this.remaining);
    this.publish(previous);
    if (this.stopped) {
      return;
    }
    if (this.remaining <= 0 && !this.completed) {
      this.completed = true;
      this.onComplete?.();
    }
  }

  /** Re-reads TIMER_CONFIG while the game is paused so debug sliders still respond. */
  refresh(): void {
    this.layout();
  }

  /** Places the clock inside the square frame. */
  resize(viewWidth: number): void {
    this.viewWidth = viewWidth;
    this.layout();
  }

  private layout(): void {
    const size = this.logic?.size ?? TIMER_CONFIG.size;
    this.time.style.fontSize = size;
    this.time.style.fill = this.colorOverride ?? this.logic?.color ?? TIMER_CONFIG.color;
    this.time.style.letterSpacing = size > 80 ? 4 : 1;
    if (this.logic?.place === 'center') {
      this.time.anchor.set(0.5);
      this.time.position.set(this.viewWidth / 2, this.viewWidth / 2);
      return;
    }
    this.time.anchor.set(1, 0);
    this.time.position.set(this.viewWidth - TIMER_CONFIG.right, TIMER_CONFIG.top);
  }

  private publish(previous: number): void {
    if (this.remaining !== previous) {
      this.onChange?.(this.remaining, previous);
    }
  }
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
