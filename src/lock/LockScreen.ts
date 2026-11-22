import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { GAME_FONTS } from '../theme/fonts';
import { LOCK_CONFIG } from './LockConfig';
import { matchesCombination, turnWheel, wheelValue, type LockState } from './lockLogic';
import type { LockStore } from './LockStore';
import type { LockDef, LockSoundCue } from './types';

const INK = '#4a372d';
const CREAM = 0xfffbf7;
const CREAM_DIM = 0xf7efe6;
const TERRACOTTA = 0xd97757;
const TERRACOTTA_HOT = 0xc86646;
const LINE = 0xe6d6c5;
const PLATE = 0x3b3631;
const PLATE_EDGE = 0x5a5047;
const SOLVED = 0x6a9a5b;
const SOLVED_FILL = 0xe6f1df;

/**
 * What the game lends a lock while it is open.
 * The lock never reaches into the game: sounds and art go through here.
 */
export interface LockSession {
  /** Names this lock across the whole game. The store keeps its wheels under it. */
  key: string;
  def: LockDef;
  playSound(cue: LockSoundCue): void;
  /** Resolves the panel art. Null keeps the drawn plate. */
  loadImage(path: string): Promise<Texture | null>;
}

/**
 * player: the close button, before solving.
 * solved: every wheel matched.
 * interrupted: the game closed the panel, such as on a scene change.
 */
export type LockCloseReason = 'player' | 'solved' | 'interrupted';

type HitId = 'close' | `up:${number}` | `down:${number}` | `wheel:${number}`;

interface Hit {
  id: HitId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A combination lock drawn inside the square frame. Clicks are its only input.
 * An arrow or a wheel turns that wheel, the close button leaves.
 * The wheels are kept in a LockStore, so leaving and coming back resumes them.
 * Once solved, the panel closes by itself and that lock never opens again.
 */
export class LockScreen {
  readonly root = new Container({ label: 'lock' });
  /** Fires once per lock, as the panel closes on a solved lock. */
  onSolved: ((key: string) => void) | null = null;
  /** Fires every time the panel closes, after onSolved. */
  onClose: ((key: string, reason: LockCloseReason) => void) | null = null;

  private readonly store: LockStore;
  private session: LockSession | null = null;
  private state: LockState | null = null;
  private art: Texture | null = null;
  private artToken = 0;
  private side = 1;
  private hover: HitId | null = null;
  private readonly hits: Hit[] = [];
  private valueTexts: Text[] = [];
  /** Milliseconds left on each wheel's pulse. */
  private pulses: number[] = [];
  /** Milliseconds before a solved panel closes. */
  private solvedHold = 0;

  constructor(store: LockStore) {
    this.store = store;
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  /** Opens on the saved wheels. False when that lock is solved, or another one is open. */
  open(session: LockSession): boolean {
    if (this.session || this.store.isSolved(session.key)) {
      return false;
    }
    this.session = session;
    this.state = this.store.state(session.key, session.def);
    this.pulses = session.def.combination.map(() => 0);
    this.solvedHold = 0;
    this.hover = null;
    this.art = null;
    this.root.visible = true;
    play(session, session.def.sounds.open);
    this.draw();
    this.loadArt(session);
    return true;
  }

  /** Closes from outside, such as a scene change. The wheels stay where they are. */
  close(): void {
    this.finish('interrupted');
  }

  resize(side: number): void {
    this.side = Math.max(1, side);
    if (this.session) {
      this.draw();
    }
  }

  update(deltaMS: number): void {
    if (!this.session) {
      return;
    }
    for (let wheel = 0; wheel < this.pulses.length; wheel += 1) {
      this.pulses[wheel] = Math.max(0, (this.pulses[wheel] ?? 0) - deltaMS);
    }
    this.applyPulses();
    if (this.state?.solved) {
      this.solvedHold -= deltaMS;
      if (this.solvedHold <= 0) {
        this.finish('solved');
      }
    }
  }

  /** Screen point inside the frame. True over something clickable. */
  hoverAt(x: number, y: number): boolean {
    const next = this.hitAt(x, y);
    if (next !== this.hover) {
      this.hover = next;
      this.draw();
    }
    return next !== null;
  }

  pointerDown(x: number, y: number): void {
    const session = this.session;
    const state = this.state;
    const id = this.hitAt(x, y);
    if (!session || !state || !id) {
      return;
    }
    if (id === 'close') {
      this.finish(state.solved ? 'solved' : 'player');
      return;
    }

    const [kind, index] = id.split(':');
    const wheel = Number(index);
    if (!turnWheel(session.def, state, wheel, kind === 'down' ? -1 : 1)) {
      return;
    }
    this.pulses[wheel] = LOCK_CONFIG.pulseMs;
    play(session, session.def.sounds.change);
    if (matchesCombination(session.def, state)) {
      state.solved = true;
      this.solvedHold = LOCK_CONFIG.solveHoldMs;
      this.hover = null;
      play(session, session.def.sounds.solve);
    }
    this.draw();
  }

  private finish(reason: LockCloseReason): void {
    const session = this.session;
    if (!session) {
      return;
    }
    const solved = this.state?.solved === true;
    this.session = null;
    this.state = null;
    this.art = null;
    this.artToken += 1;
    this.hover = null;
    this.clear();
    this.root.visible = false;
    if (reason === 'player') {
      play(session, session.def.sounds.close);
    }
    if (solved) {
      this.onSolved?.(session.key);
    }
    this.onClose?.(session.key, reason);
  }

  private loadArt(session: LockSession): void {
    const path = session.def.panel;
    if (!path) {
      return;
    }
    const token = ++this.artToken;
    session.loadImage(path).then(
      (texture) => {
        if (token !== this.artToken || this.session !== session || !texture) {
          return;
        }
        this.art = texture;
        this.draw();
      },
      () => undefined,
    );
  }

  private hitAt(x: number, y: number): HitId | null {
    for (const hit of this.hits) {
      if (x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) {
        return hit.id;
      }
    }
    return null;
  }

  private clear(): void {
    this.hits.length = 0;
    this.valueTexts = [];
    this.root.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  private draw(): void {
    this.clear();
    const session = this.session;
    const state = this.state;
    if (!session || !state) {
      return;
    }
    const def = session.def;
    const side = this.side;
    const solved = state.solved;

    const dim = new Graphics();
    dim.rect(0, 0, side, side).fill({ color: 0x000000, alpha: 0.55 });
    this.root.addChild(dim);

    const width = Math.max(200, Math.min(LOCK_CONFIG.maxWidth, side - 40));
    const height = width * LOCK_CONFIG.aspect;
    const x = (side - width) / 2;
    const y = (side - height) / 2;
    this.drawPlate(x, y, width, height, solved);

    const title = label(def.title, width * 0.058, GAME_FONTS.display, '#fffaf5');
    title.anchor.set(0.5, 0);
    title.position.set(side / 2, y + height * 0.07);
    this.root.addChild(title);

    this.drawClose(x + width, y, width);

    const count = def.combination.length;
    const gap = width * 0.035;
    const wheelWidth = Math.min(width * 0.15, (width * 0.84 - gap * (count - 1)) / count);
    const windowHeight = wheelWidth * 1.2;
    const arrowHeight = wheelWidth * 0.42;
    const spacing = wheelWidth * 0.1;
    const columnHeight = arrowHeight * 2 + spacing * 2 + windowHeight;
    const left = (side - (wheelWidth * count + gap * (count - 1))) / 2;
    const top = y + height * 0.53 - columnHeight / 2;
    for (let wheel = 0; wheel < count; wheel += 1) {
      const wheelX = left + wheel * (wheelWidth + gap);
      const windowY = top + arrowHeight + spacing;
      this.drawArrow(`up:${wheel}`, wheelX, top, wheelWidth, arrowHeight, -1, solved);
      this.drawWindow(wheel, wheelValue(def, state, wheel), wheelX, windowY, wheelWidth, windowHeight, solved);
      this.drawArrow(`down:${wheel}`, wheelX, windowY + windowHeight + spacing, wheelWidth, arrowHeight, 1, solved);
    }

    const hint = label(
      solved ? LOCK_CONFIG.solvedHint : LOCK_CONFIG.hint,
      width * (solved ? 0.05 : 0.034),
      solved ? GAME_FONTS.display : GAME_FONTS.cozy,
      solved ? '#cfe8c4' : '#efe3d5',
    );
    hint.anchor.set(0.5);
    hint.position.set(side / 2, y + height * 0.9);
    this.root.addChild(hint);
    this.applyPulses();
  }

  private drawPlate(x: number, y: number, width: number, height: number, solved: boolean): void {
    const radius = width * 0.05;
    const art = this.art;
    if (art && art.width > 0 && art.height > 0) {
      const sprite = new Sprite(art);
      const scale = Math.max(width / art.width, height / art.height);
      sprite.scale.set(scale);
      sprite.position.set(x + (width - art.width * scale) / 2, y + (height - art.height * scale) / 2);
      const mask = new Graphics();
      mask.roundRect(x, y, width, height, radius).fill(0xffffff);
      sprite.mask = mask;
      this.root.addChild(mask, sprite);
    } else {
      const plate = new Graphics();
      plate.roundRect(x, y, width, height, radius).fill({ color: PLATE });
      plate.roundRect(x + 10, y + 10, width - 20, height - 20, radius * 0.7).stroke({ color: PLATE_EDGE, width: 2 });
      this.root.addChild(plate);
    }
    const rim = new Graphics();
    rim.roundRect(x, y, width, height, radius).stroke({ color: solved ? SOLVED : PLATE_EDGE, width: 4 });
    this.root.addChild(rim);
  }

  private drawClose(right: number, top: number, panelWidth: number): void {
    const size = Math.max(28, panelWidth * 0.065);
    const inset = panelWidth * 0.035;
    const x = right - inset - size;
    const y = top + inset;
    const hot = this.hover === 'close';
    const close = new Graphics();
    close.roundRect(x, y, size, size, size / 2).fill({ color: hot ? TERRACOTTA : CREAM_DIM }).stroke({
      color: hot ? TERRACOTTA_HOT : LINE,
      width: 2,
    });
    const arm = size * 0.32;
    close
      .moveTo(x + arm, y + arm)
      .lineTo(x + size - arm, y + size - arm)
      .moveTo(x + size - arm, y + arm)
      .lineTo(x + arm, y + size - arm)
      .stroke({ color: hot ? CREAM : 0x4a372d, width: 2.5, cap: 'round' });
    this.root.addChild(close);
    this.hits.push({ id: 'close', x, y, width: size, height: size });
  }

  /** pointsDown is -1 for a triangle pointing up, 1 for one pointing down. */
  private drawArrow(
    id: HitId,
    x: number,
    y: number,
    width: number,
    height: number,
    pointsDown: -1 | 1,
    solved: boolean,
  ): void {
    const hot = !solved && this.hover === id;
    const button = new Graphics();
    button.roundRect(x, y, width, height, height * 0.35).fill({ color: hot ? TERRACOTTA : CREAM_DIM }).stroke({
      color: hot ? TERRACOTTA_HOT : LINE,
      width: 2,
    });
    const cx = x + width / 2;
    const cy = y + height / 2;
    const half = Math.min(width, height) * 0.28;
    button
      .poly([
        cx - half, cy - (half * 0.6 * pointsDown),
        cx + half, cy - (half * 0.6 * pointsDown),
        cx, cy + (half * 0.6 * pointsDown),
      ])
      .fill({ color: hot ? CREAM : TERRACOTTA });
    button.alpha = solved ? 0.35 : 1;
    this.root.addChild(button);
    if (!solved) {
      this.hits.push({ id, x, y, width, height });
    }
  }

  private drawWindow(
    wheel: number,
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    solved: boolean,
  ): void {
    const id: HitId = `wheel:${wheel}`;
    const hot = !solved && this.hover === id;
    const frame = new Graphics();
    frame.roundRect(x, y, width, height, width * 0.16).fill({ color: solved ? SOLVED_FILL : CREAM }).stroke({
      color: solved ? SOLVED : hot ? TERRACOTTA : LINE,
      width: 3,
    });
    this.root.addChild(frame);

    const text = new Text({
      text: value,
      anchor: 0.5,
      style: {
        fill: solved ? '#3f6b35' : INK,
        fontFamily: GAME_FONTS.mono,
        fontWeight: '600',
        fontSize: Math.max(12, height * 0.5),
      },
    });
    text.position.set(x + width / 2, y + height / 2);
    this.root.addChild(text);
    this.valueTexts[wheel] = text;
    if (!solved) {
      this.hits.push({ id, x, y, width, height });
    }
  }

  private applyPulses(): void {
    this.valueTexts.forEach((text, wheel) => {
      const left = this.pulses[wheel] ?? 0;
      text.scale.set(1 + LOCK_CONFIG.pulseScale * (left / LOCK_CONFIG.pulseMs));
    });
  }
}

function play(session: LockSession, cue: LockSoundCue | null): void {
  if (cue && cue.volume > 0) {
    session.playSound(cue);
  }
}

function label(text: string, size: number, family: string, fill: string): Text {
  return new Text({
    text,
    style: {
      fill,
      fontFamily: family,
      fontWeight: '700',
      fontSize: Math.max(12, size),
      align: 'center',
      dropShadow: { color: '#000000', alpha: 0.45, blur: 4, distance: 2, angle: Math.PI / 2 },
    },
  });
}
