import type {
  ActionDef,
  AudioCue,
  CharacterDef,
  DialogueDef,
  DialogueLine,
  TriggerDef,
  LevelDef,
  SceneDef,
  SceneFit,
} from './types';

/**
 * Turns raw JSON into definitions.
 * Each problem is reported with its file and field, and a usable default is kept
 * where possible, so one typo does not stop the whole game from loading.
 */
export class ContentProblems {
  readonly messages: string[] = [];

  add(where: string, message: string): void {
    this.messages.push(`${where}: ${message}`);
  }
}

type Json = Record<string, unknown>;

const LEVEL_KEYS = ['$schema', 'name', 'startScene', 'scenes', 'ambience'];
const SCENE_KEYS = ['name', 'fit', 'background', 'characters', 'dialogue', 'ambience', 'onEnter', 'triggers'];
const CHARACTER_KEYS = ['image', 'x', 'y', 'scale'];
const CUE_KEYS = ['file', 'volume'];
const TRIGGER_KEYS = ['id', 'x', 'y', 'width', 'height', 'actions'];
const SHAKE_KEYS = ['intensity', 'duration'];
const DIALOGUE_KEYS = ['$schema', 'lines'];
const LINE_KEYS = ['speaker', 'text', 'audio'];
const ACTION_KINDS = ['sound', 'dialogue', 'go', 'shake'] as const;
const FITS: readonly SceneFit[] = ['cover', 'contain'];
const DEFAULT_SHAKE_INTENSITY = 10;
const DEFAULT_SHAKE_MS = 300;

export function parseLevel(
  id: string,
  file: string,
  raw: unknown,
  problems: ContentProblems,
): LevelDef | null {
  if (!isObject(raw)) {
    problems.add(file, 'expected an object');
    return null;
  }
  checkKeys(raw, LEVEL_KEYS, file, problems);

  const rawScenes = raw.scenes;
  if (!isObject(rawScenes) || Object.keys(rawScenes).length === 0) {
    problems.add(file, '"scenes" needs at least one scene');
    return null;
  }

  const scenes: SceneDef[] = [];
  for (const [sceneId, rawScene] of Object.entries(rawScenes)) {
    const scene = parseScene(sceneId, rawScene, `${file} → scenes.${sceneId}`, problems);
    if (scene) {
      scenes.push(scene);
    }
  }
  if (scenes.length === 0) {
    return null;
  }

  let startScene = optionalString(raw, 'startScene', file, problems) ?? scenes[0].id;
  if (!scenes.some((scene) => scene.id === startScene)) {
    problems.add(file, `"startScene" is "${startScene}", which is not one of the scenes`);
    startScene = scenes[0].id;
  }

  return {
    id,
    name: optionalString(raw, 'name', file, problems) ?? id,
    startScene,
    ambience: parseCue(raw.ambience, `${file} → ambience`, problems),
    scenes,
  };
}

function parseScene(
  id: string,
  raw: unknown,
  where: string,
  problems: ContentProblems,
): SceneDef | null {
  if (!isObject(raw)) {
    problems.add(where, 'expected an object');
    return null;
  }
  checkKeys(raw, SCENE_KEYS, where, problems);

  let fit: SceneFit = 'cover';
  if (raw.fit !== undefined) {
    if (FITS.includes(raw.fit as SceneFit)) {
      fit = raw.fit as SceneFit;
    } else {
      problems.add(where, `"fit" must be ${FITS.map((value) => `"${value}"`).join(' or ')}`);
    }
  }

  const characters: CharacterDef[] = [];
  if (raw.characters !== undefined) {
    if (Array.isArray(raw.characters)) {
      raw.characters.forEach((rawCharacter, index) => {
        const character = parseCharacter(rawCharacter, `${where}.characters[${index}]`, problems);
        if (character) {
          characters.push(character);
        }
      });
    } else {
      problems.add(where, '"characters" must be a list');
    }
  }

  return {
    id,
    name: optionalString(raw, 'name', where, problems) ?? id,
    fit,
    background: optionalString(raw, 'background', where, problems),
    characters,
    dialogue: optionalString(raw, 'dialogue', where, problems),
    ambience: parseCue(raw.ambience, `${where}.ambience`, problems),
    onEnter: parseActions(raw.onEnter, `${where}.onEnter`, problems),
    triggers: parseTriggers(raw.triggers, `${where}.triggers`, problems),
  };
}

function parseCharacter(
  raw: unknown,
  where: string,
  problems: ContentProblems,
): CharacterDef | null {
  if (!isObject(raw)) {
    problems.add(where, 'expected an object');
    return null;
  }
  checkKeys(raw, CHARACTER_KEYS, where, problems);

  const image = optionalString(raw, 'image', where, problems);
  const x = requiredNumber(raw, 'x', where, problems);
  const y = requiredNumber(raw, 'y', where, problems);
  if (image === null) {
    problems.add(where, '"image" is required');
  }
  if (image === null || x === null || y === null) {
    return null;
  }

  let scale = 1;
  if (raw.scale !== undefined) {
    if (typeof raw.scale === 'number' && raw.scale > 0) {
      scale = raw.scale;
    } else {
      problems.add(where, '"scale" must be a number above 0');
    }
  }

  return { image, x, y, scale };
}

/** Absent cue stays null. A present cue that cannot be read stays null too. */
function parseCue(raw: unknown, where: string, problems: ContentProblems): AudioCue | null {
  if (raw === undefined) {
    return null;
  }
  if (!isObject(raw)) {
    problems.add(where, 'expected an object with "file"');
    return null;
  }
  checkKeys(raw, CUE_KEYS, where, problems);

  const file = optionalString(raw, 'file', where, problems);
  if (file === null) {
    problems.add(where, '"file" is required');
    return null;
  }
  return { file, volume: readVolume(raw, where, problems) };
}

function parseActions(raw: unknown, where: string, problems: ContentProblems): ActionDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    problems.add(where, 'must be a list');
    return [];
  }

  const actions: ActionDef[] = [];
  raw.forEach((item, index) => {
    const action = parseAction(item, `${where}[${index}]`, problems);
    if (action) {
      actions.push(action);
    }
  });
  return actions;
}

function parseAction(raw: unknown, where: string, problems: ContentProblems): ActionDef | null {
  if (!isObject(raw)) {
    problems.add(where, 'expected an object');
    return null;
  }

  const kinds = ACTION_KINDS.filter((kind) => raw[kind] !== undefined);
  if (kinds.length !== 1) {
    problems.add(where, `needs exactly one of ${ACTION_KINDS.map((kind) => `"${kind}"`).join(', ')}`);
    return null;
  }

  const kind = kinds[0];
  if (kind === 'sound') {
    return parseSoundAction(raw, where, problems);
  }
  if (kind === 'dialogue') {
    return parseDialogueAction(raw, where, problems);
  }
  if (kind === 'go') {
    return parseGoAction(raw, where, problems);
  }
  return parseShakeAction(raw, where, problems);
}

function parseSoundAction(raw: Json, where: string, problems: ContentProblems): ActionDef | null {
  checkKeys(raw, ['sound', 'volume'], where, problems);
  const file = optionalString(raw, 'sound', where, problems);
  if (file === null) {
    return null;
  }
  return { type: 'sound', file, volume: readVolume(raw, where, problems) };
}

function parseDialogueAction(raw: Json, where: string, problems: ContentProblems): ActionDef | null {
  checkKeys(raw, ['dialogue'], where, problems);
  const id = optionalString(raw, 'dialogue', where, problems);
  if (id === null) {
    return null;
  }
  return { type: 'dialogue', id };
}

function parseGoAction(raw: Json, where: string, problems: ContentProblems): ActionDef | null {
  checkKeys(raw, ['go'], where, problems);
  const sceneId = optionalString(raw, 'go', where, problems);
  if (sceneId === null) {
    return null;
  }
  return { type: 'go', sceneId };
}

function parseShakeAction(raw: Json, where: string, problems: ContentProblems): ActionDef | null {
  checkKeys(raw, ['shake'], where, problems);
  const shake = raw.shake;
  if (shake === true) {
    return { type: 'shake', intensity: DEFAULT_SHAKE_INTENSITY, durationMs: DEFAULT_SHAKE_MS };
  }
  if (!isObject(shake)) {
    problems.add(where, '"shake" must be true, or an object with "intensity" and "duration"');
    return null;
  }

  checkKeys(shake, SHAKE_KEYS, where, problems);
  return {
    type: 'shake',
    intensity: readNonNegative(shake, 'intensity', DEFAULT_SHAKE_INTENSITY, where, problems),
    durationMs: readNonNegative(shake, 'duration', DEFAULT_SHAKE_MS, where, problems),
  };
}

function parseTriggers(raw: unknown, where: string, problems: ContentProblems): TriggerDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    problems.add(where, 'must be a list');
    return [];
  }

  const triggers: TriggerDef[] = [];
  raw.forEach((item, index) => {
    const trigger = parseTrigger(item, `${where}[${index}]`, index, problems);
    if (trigger) {
      triggers.push(trigger);
    }
  });
  return triggers;
}

function parseTrigger(
  raw: unknown,
  where: string,
  index: number,
  problems: ContentProblems,
): TriggerDef | null {
  if (!isObject(raw)) {
    problems.add(where, 'expected an object');
    return null;
  }
  checkKeys(raw, TRIGGER_KEYS, where, problems);

  const x = requiredNumber(raw, 'x', where, problems);
  const y = requiredNumber(raw, 'y', where, problems);
  const width = readPositive(raw, 'width', where, problems);
  const height = readPositive(raw, 'height', where, problems);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  const id = optionalString(raw, 'id', where, problems) ?? `trigger-${index}`;
  if (raw.id === undefined) {
    problems.add(where, '"id" is required');
  }
  if (raw.actions === undefined) {
    problems.add(where, '"actions" is required');
  }

  return {
    id,
    x,
    y,
    width,
    height,
    actions: parseActions(raw.actions, `${where}.actions`, problems),
  };
}

export function parseDialogue(
  id: string,
  file: string,
  raw: unknown,
  problems: ContentProblems,
): DialogueDef | null {
  if (!isObject(raw)) {
    problems.add(file, 'expected an object');
    return null;
  }
  checkKeys(raw, DIALOGUE_KEYS, file, problems);

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    problems.add(file, '"lines" needs at least one line');
    return null;
  }

  const lines: DialogueLine[] = [];
  raw.lines.forEach((rawLine, index) => {
    const where = `${file} → lines[${index}]`;
    if (!isObject(rawLine)) {
      problems.add(where, 'expected an object');
      return;
    }
    checkKeys(rawLine, LINE_KEYS, where, problems);
    const text = optionalString(rawLine, 'text', where, problems);
    if (text === null) {
      problems.add(where, '"text" is required');
      return;
    }
    lines.push({
      speaker: optionalString(rawLine, 'speaker', where, problems) ?? '',
      text,
      audio: optionalString(rawLine, 'audio', where, problems),
    });
  });

  return lines.length > 0 ? { id, lines } : null;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Catches typos such as "backgroud", which would otherwise be ignored silently. */
function checkKeys(raw: Json, allowed: readonly string[], where: string, problems: ContentProblems): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      problems.add(where, `unknown field "${key}" (allowed: ${allowed.join(', ')})`);
    }
  }
}

function optionalString(raw: Json, key: string, where: string, problems: ContentProblems): string | null {
  const value = raw[key];
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    problems.add(where, `"${key}" must be a non-empty string`);
    return null;
  }
  return value;
}

function requiredNumber(raw: Json, key: string, where: string, problems: ContentProblems): number | null {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.add(where, `"${key}" must be a number`);
    return null;
  }
  return value;
}

/** Missing volume is 1. An invalid volume is reported and replaced with 1. */
function readVolume(raw: Json, where: string, problems: ContentProblems): number {
  if (raw.volume === undefined) {
    return 1;
  }
  if (typeof raw.volume !== 'number' || raw.volume < 0 || raw.volume > 1) {
    problems.add(where, '"volume" must be a number from 0 to 1');
    return 1;
  }
  return raw.volume;
}

function readPositive(raw: Json, key: string, where: string, problems: ContentProblems): number | null {
  const value = requiredNumber(raw, key, where, problems);
  if (value === null) {
    return null;
  }
  if (value <= 0) {
    problems.add(where, `"${key}" must be above 0`);
    return null;
  }
  return value;
}

function readNonNegative(
  raw: Json,
  key: string,
  fallback: number,
  where: string,
  problems: ContentProblems,
): number {
  if (raw[key] === undefined) {
    return fallback;
  }
  const value = requiredNumber(raw, key, where, problems);
  if (value === null) {
    return fallback;
  }
  if (value < 0) {
    problems.add(where, `"${key}" must be 0 or above`);
    return fallback;
  }
  return value;
}
