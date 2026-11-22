import type { LockDef } from './types';

/**
 * Where a lock's wheels sit. Kept between visits, so the player picks up where they left.
 * wheels holds one index into LockDef.values per wheel.
 */
export interface LockState {
  readonly wheels: number[];
  solved: boolean;
}

/** Wheels on the start values, or on the first value when the lock sets none. */
export function createLockState(def: LockDef): LockState {
  const wheels = def.combination.map((_, wheel) => {
    const start = def.start?.[wheel];
    const index = start === undefined ? 0 : def.values.indexOf(start);
    return index < 0 ? 0 : index;
  });
  return { wheels, solved: false };
}

/** False when the lock changed shape since this state was saved. */
export function fitsLock(def: LockDef, state: LockState): boolean {
  return state.wheels.length === def.combination.length
    && state.wheels.every((index) => Number.isInteger(index) && index >= 0 && index < def.values.length);
}

/**
 * Moves one wheel by step values, wrapping at both ends.
 * Returns false when nothing moved: a solved lock, or a wheel that does not exist.
 */
export function turnWheel(def: LockDef, state: LockState, wheel: number, step: number): boolean {
  const count = def.values.length;
  const current = state.wheels[wheel];
  if (state.solved || current === undefined || count < 2 || step === 0) {
    return false;
  }
  state.wheels[wheel] = (((current + step) % count) + count) % count;
  return true;
}

export function wheelValue(def: LockDef, state: LockState, wheel: number): string {
  return def.values[state.wheels[wheel] ?? 0] ?? '';
}

/** True when every wheel shows the value the combination asks for. */
export function matchesCombination(def: LockDef, state: LockState): boolean {
  return def.combination.every((expected, wheel) => wheelValue(def, state, wheel) === expected);
}
