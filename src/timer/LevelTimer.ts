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

  private logic: TimerLogic | null = null;
  private remaining = 0;
  private carry = 0;
  private viewWidth = 0;
  private completed = false;
  /** Debug hold. The clock stays on screen and does not count. */
  private held = false;

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

  /** One second of the clock per second of play. A pause skips this. */
  update(deltaMS: number): void {
    if (!this.logic || !this.root.visible) {
      return;
    }
    this.layout();
    if (this.held || this.remaining <= 0) {
      return;
    }
    this.carry += deltaMS;
    if (this.carry < 1000) {
      return;
    }
    const steps = Math.floor(this.carry / 1000);
    this.carry -= steps * 1000;
    for (let step = 0; step < steps; step += 1) {
      this.remaining = this.logic.tick(this.remaining);
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.carry = 0;
        break;
      }
    }
    this.time.text = formatClock(this.remaining);
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
    this.time.style.fontSize = TIMER_CONFIG.size;
    this.time.style.fill = TIMER_CONFIG.color;
    this.time.position.set(this.viewWidth - TIMER_CONFIG.right, TIMER_CONFIG.top);
  }
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
