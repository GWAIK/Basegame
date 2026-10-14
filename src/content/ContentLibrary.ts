import { ContentProblems, parseDialogue, parseLevel } from './parse';
import type { ActionDef, DialogueDef, LevelDef, SceneDef } from './types';

/*
 * Everything under content/ is found at build time.
 * Adding a level folder, a dialogue file, or an image needs no code change.
 * Vite rewrites asset URLs, so they work at the site root, in a sub-folder
 * (GitHub Pages), and inside the itch.io player.
 */
const levelFiles = import.meta.glob<unknown>('/content/levels/*/level.json', {
  eager: true,
  import: 'default',
});
const dialogueFiles = import.meta.glob<unknown>('/content/dialogues/*.json', {
  eager: true,
  import: 'default',
});
const assetFiles = import.meta.glob<string>(
  '/content/**/*.{png,jpg,jpeg,webp,gif,mp3,ogg,wav,m4a,PNG,JPG,JPEG,WEBP,GIF,MP3,OGG,WAV,M4A}',
  { eager: true, query: '?url', import: 'default' },
);

const CONTENT_ROOT = '/content';

export class ContentLibrary {
  readonly levels: readonly LevelDef[];
  readonly dialogues: ReadonlyMap<string, DialogueDef>;
  /** Readable messages about broken content. Empty when everything loaded. */
  readonly problems: readonly string[];

  private readonly assets: ReadonlyMap<string, string>;

  private constructor(
    levels: LevelDef[],
    dialogues: Map<string, DialogueDef>,
    assets: Map<string, string>,
    problems: string[],
  ) {
    this.levels = levels;
    this.dialogues = dialogues;
    this.assets = assets;
    this.problems = problems;
  }

  static load(): ContentLibrary {
    const problems = new ContentProblems();
    const assets = new Map(Object.entries(assetFiles));

    const dialogues = new Map<string, DialogueDef>();
    for (const [path, raw] of Object.entries(dialogueFiles)) {
      const id = fileStem(path);
      const dialogue = parseDialogue(id, displayPath(path), raw, problems);
      if (dialogue) {
        dialogues.set(id, dialogue);
      }
    }

    const levels: LevelDef[] = [];
    for (const [path, raw] of Object.entries(levelFiles)) {
      const id = parentFolder(path);
      const level = parseLevel(id, displayPath(path), raw, problems);
      if (level) {
        levels.push(level);
      }
    }
    levels.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    if (levels.length === 0) {
      problems.add('content/levels', 'no level found. Add a folder with a level.json inside');
    }

    const library = new ContentLibrary(levels, dialogues, assets, problems.messages);
    library.checkReferences(problems);
    return library;
  }

  get firstLevel(): LevelDef | null {
    return this.levels[0] ?? null;
  }

  level(levelId: string): LevelDef | null {
    return this.levels.find((level) => level.id === levelId) ?? null;
  }

  scene(level: LevelDef, sceneId: string): SceneDef | null {
    return level.scenes.find((scene) => scene.id === sceneId) ?? null;
  }

  dialogue(dialogueId: string): DialogueDef | null {
    return this.dialogues.get(dialogueId) ?? null;
  }

  /**
   * URL of an asset referenced from a level.
   * "backgrounds/room.webp" is inside the level folder. "/shared/audio/room.wav" is from content/.
   */
  assetUrl(levelId: string, path: string): string | null {
    return this.assets.get(assetKey(levelId, path)) ?? null;
  }

  /** URL of an asset whose path starts at content/, such as a dialogue voice line. */
  contentAssetUrl(path: string): string | null {
    return this.assets.get(contentKey(path)) ?? null;
  }

  private checkReferences(problems: ContentProblems): void {
    for (const dialogue of this.dialogues.values()) {
      const file = `content/dialogues/${dialogue.id}.json`;
      dialogue.lines.forEach((line, index) => {
        if (line.audio) {
          this.checkKey(contentKey(line.audio), `${file} → lines[${index}].audio`, problems);
        }
      });
    }

    for (const level of this.levels) {
      const file = `content/levels/${level.id}/level.json`;
      if (level.ambience) {
        this.checkAsset(level.id, level.ambience.file, `${file} → ambience.file`, problems);
      }
      for (const scene of level.scenes) {
        const where = `${file} → scenes.${scene.id}`;
        if (scene.background) {
          this.checkAsset(level.id, scene.background, `${where}.background`, problems);
        }
        if (scene.ambience) {
          this.checkAsset(level.id, scene.ambience.file, `${where}.ambience.file`, problems);
        }
        scene.characters.forEach((character, index) => {
          this.checkAsset(level.id, character.image, `${where}.characters[${index}].image`, problems);
        });
        if (scene.dialogue && !this.dialogues.has(scene.dialogue)) {
          problems.add(where, `dialogue "${scene.dialogue}" not found in content/dialogues`);
        }
        scene.onEnter.forEach((action, index) => {
          this.checkAction(level, action, `${where}.onEnter[${index}]`, problems);
        });
        scene.triggers.forEach((trigger, triggerIndex) => {
          trigger.actions.forEach((action, actionIndex) => {
            this.checkAction(
              level,
              action,
              `${where}.triggers[${triggerIndex}].actions[${actionIndex}]`,
              problems,
            );
          });
        });
      }
    }
  }

  private checkAction(level: LevelDef, action: ActionDef, where: string, problems: ContentProblems): void {
    if (action.type === 'sound') {
      this.checkAsset(level.id, action.file, `${where}.sound`, problems);
      return;
    }
    if (action.type === 'dialogue' && !this.dialogues.has(action.id)) {
      problems.add(where, `dialogue "${action.id}" not found in content/dialogues`);
      return;
    }
    if (action.type === 'go' && !level.scenes.some((scene) => scene.id === action.sceneId)) {
      problems.add(where, `"go" is "${action.sceneId}", which is not a scene in this level`);
    }
  }

  private checkAsset(levelId: string, path: string, where: string, problems: ContentProblems): void {
    this.checkKey(assetKey(levelId, path), where, problems);
  }

  private checkKey(key: string, where: string, problems: ContentProblems): void {
    if (this.assets.has(key)) {
      return;
    }

    const lower = key.toLowerCase();
    const sameButCase = [...this.assets.keys()].find((candidate) => candidate.toLowerCase() === lower);
    const hint = sameButCase
      ? `. Letter case differs: the file is ${displayPath(sameButCase)} (itch.io is case-sensitive)`
      : '';
    problems.add(where, `file not found: ${displayPath(key)}${hint}`);
  }
}

function assetKey(levelId: string, path: string): string {
  const clean = path.trim().replace(/^\.\//, '');
  if (clean.startsWith('/')) {
    return `${CONTENT_ROOT}${clean}`;
  }
  return `${CONTENT_ROOT}/levels/${levelId}/${clean}`;
}

function contentKey(path: string): string {
  const clean = path.trim().replace(/^\.\//, '');
  if (clean.startsWith('/')) {
    return `${CONTENT_ROOT}${clean}`;
  }
  return `${CONTENT_ROOT}/${clean}`;
}

function displayPath(key: string): string {
  return key.replace(/^\//, '');
}

function fileStem(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.replace(/\.json$/, '');
}

function parentFolder(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 2];
}
