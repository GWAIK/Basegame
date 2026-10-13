import type {
  CharacterDef,
  DialogueDef,
  DialogueLine,
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

const LEVEL_KEYS = ['$schema', 'name', 'startScene', 'scenes'];
const SCENE_KEYS = ['name', 'fit', 'background', 'characters', 'dialogue'];
const CHARACTER_KEYS = ['image', 'x', 'y', 'scale'];
const DIALOGUE_KEYS = ['$schema', 'lines'];
const LINE_KEYS = ['speaker', 'text'];
const FITS: readonly SceneFit[] = ['cover', 'contain'];

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
    lines.push({ speaker: optionalString(rawLine, 'speaker', where, problems) ?? '', text });
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
