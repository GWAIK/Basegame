/** An order written on an Ink line, such as `# sound: shared/audio/whisper.wav`. */
export type InkEffect =
  | { type: 'sound'; file: string; volume: number }
  | { type: 'shake'; intensity: number; durationMs: number }
  | { type: 'event'; name: string }
  | { type: 'go'; sceneId: string }
  | { type: 'level'; levelId: string }
  | { type: 'quit' };

export interface InkLine {
  speaker: string;
  text: string;
  effects: InkEffect[];
}

const DEFAULT_SHAKE_INTENSITY = 10;
const DEFAULT_SHAKE_MS = 300;

/** go, level, and quit end the knot. sound and shake happen while the line is showing. */
export function isEnding(effect: InkEffect): boolean {
  return effect.type === 'go' || effect.type === 'level' || effect.type === 'quit';
}

/** Splits `Lucy: Hello` and reads tags. A `speaker:` tag wins over the prefix. */
export function readInkLine(rawText: string, tags: readonly string[]): InkLine {
  const speakerTag = tags.find((tag) => tag.trim().toLowerCase().startsWith('speaker:'));
  const speakerFromTag = speakerTag ? speakerTag.slice(speakerTag.indexOf(':') + 1).trim() : null;
  const trimmed = rawText.trim();
  const prefixed = trimmed.match(/^([^:\n]{1,40}):\s+([\s\S]+)$/);
  const speaker = speakerFromTag ?? (prefixed ? prefixed[1].trim() : '');
  const text = speakerFromTag || !prefixed ? trimmed : prefixed[2].trim();

  const effects: InkEffect[] = [];
  for (const tag of tags) {
    const effect = readEffect(tag);
    if (effect) {
      effects.push(effect);
    }
  }
  return { speaker, text, effects };
}

function readEffect(tag: string): InkEffect | null {
  const separator = tag.indexOf(':');
  const key = (separator === -1 ? tag : tag.slice(0, separator)).trim().toLowerCase();
  const value = separator === -1 ? '' : tag.slice(separator + 1).trim();
  if (key === 'speaker') {
    return null;
  }
  if (key === 'sound') {
    return readSound(value);
  }
  if (key === 'shake') {
    return readShake(value);
  }
  if (key === 'event' && value.length > 0) {
    return { type: 'event', name: value };
  }
  if (key === 'go' && value.length > 0) {
    return { type: 'go', sceneId: value };
  }
  if (key === 'level' && value.length > 0) {
    return { type: 'level', levelId: value };
  }
  if (key === 'quit') {
    return { type: 'quit' };
  }
  return null;
}

function readSound(value: string): InkEffect | null {
  const parts = value.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  const maybeVolume = parts.length > 1 ? Number(parts[parts.length - 1]) : Number.NaN;
  const hasVolume = Number.isFinite(maybeVolume) && maybeVolume >= 0 && maybeVolume <= 1;
  const file = (hasVolume ? parts.slice(0, -1) : parts).join(' ');
  if (file.length === 0) {
    return null;
  }
  return { type: 'sound', file, volume: hasVolume ? maybeVolume : 1 };
}

function readShake(value: string): InkEffect {
  const parts = value.split(/\s+/).filter((part) => part.length > 0).map(Number);
  const intensity = parts[0];
  const durationMs = parts[1];
  return {
    type: 'shake',
    intensity: Number.isFinite(intensity) && intensity >= 0 ? intensity : DEFAULT_SHAKE_INTENSITY,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : DEFAULT_SHAKE_MS,
  };
}
