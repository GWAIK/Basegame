import { Compiler, CompilerOptions, type Story } from 'inkjs/compiler/Compiler';
import { ContentProblems, parseLevel } from './parse';
import type { ActionDef, LevelDef, SceneDef } from './types';

/*
 * Everything under content/ is found at build time.
 * Adding a level folder, an Ink include, or an image needs no code change.
 * Vite rewrites asset URLs, so they work at the site root, in a sub-folder
 * (GitHub Pages), and inside the itch.io player.
 */
const levelFiles = import.meta.glob<unknown>('/content/levels/*/level.json', {
  eager: true,
  import: 'default',
});
const storyFiles = import.meta.glob<string>('/content/story/**/*.ink', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const STORY_FILE = '/content/story/story.ink';
const assetFiles = import.meta.glob<string>(
  '/content/**/*.{png,jpg,jpeg,webp,gif,mp3,ogg,wav,m4a,PNG,JPG,JPEG,WEBP,GIF,MP3,OGG,WAV,M4A}',
  { eager: true, query: '?url', import: 'default' },
);

const CONTENT_ROOT = '/content';

export class ContentLibrary {
  readonly levels: readonly LevelDef[];
  /** Knot names from content/story (story.ink and INCLUDE files). A level calls one with { "dialogue": "level1_stairwell" }. */
  readonly knots: readonly string[];
  /** One story for the whole game, so a fact set in a knot stays true afterwards. */
  readonly story: Story | null;
  /** Readable messages about broken content. Empty when everything loaded. */
  readonly problems: readonly string[];

  private readonly assets: ReadonlyMap<string, string>;

  private constructor(
    levels: LevelDef[],
    knots: string[],
    story: Story | null,
    assets: Map<string, string>,
    problems: string[],
  ) {
    this.levels = levels;
    this.knots = knots;
    this.story = story;
    this.assets = assets;
    this.problems = problems;
  }

  static load(): ContentLibrary {
    const problems = new ContentProblems();
    const assets = new Map(Object.entries(assetFiles));

    const { story, knots } = compileStory(problems);

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

    const library = new ContentLibrary(levels, knots, story, assets, problems.messages);
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

  hasKnot(knot: string): boolean {
    return this.knots.includes(knot);
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

  /** Image paths starting at content/, such as /shared/characters/ticket.webp. */
  images(): readonly string[] {
    const paths: string[] = [];
    for (const key of this.assets.keys()) {
      if (!/\.(png|jpe?g|webp|gif)$/i.test(key)) {
        continue;
      }
      paths.push(key.startsWith('/content/') ? key.slice('/content'.length) : key);
    }
    paths.sort((a, b) => a.localeCompare(b));
    return paths;
  }

  private checkReferences(problems: ContentProblems): void {
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
        if (scene.dialogue && !this.hasKnot(scene.dialogue)) {
          problems.add(where, `dialogue "${scene.dialogue}" is not a knot in content/story`);
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
    if (action.type === 'dialogue' && !this.hasKnot(action.id)) {
      problems.add(where, `dialogue "${action.id}" is not a knot in content/story`);
      return;
    }
    if (action.type === 'go' && !level.scenes.some((scene) => scene.id === action.sceneId)) {
      problems.add(where, `"go" is "${action.sceneId}", which is not a scene in this level`);
      return;
    }
    if (action.type === 'level' && !this.levels.some((candidate) => candidate.id === action.levelId)) {
      problems.add(where, `level "${action.levelId}" not found in content/levels`);
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

function compileStory(problems: ContentProblems): { story: Story | null; knots: string[] } {
  const source = storyFiles[STORY_FILE];
  if (source === undefined) {
    problems.add('content/story/story.ink', 'missing. Dialogues are knots in this file');
    return { story: null, knots: [] };
  }

  const files = new Map(Object.entries(storyFiles));
  const compiler = new Compiler(
    source,
    new CompilerOptions('story.ink', [], false, null, {
      ResolveInkFilename: (filename) => storyPath(filename),
      LoadInkFileContents: (filename) => {
        const path = storyPath(filename);
        const text = files.get(path);
        if (text === undefined) {
          problems.add('content/story/story.ink', `INCLUDE not found: ${filename}`);
          return '';
        }
        return text;
      },
    }),
  );

  let story: Story | null = null;
  try {
    story = compiler.Compile();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (compiler.errors.length === 0) {
      problems.add('content/story/story.ink', message);
    }
  }
  for (const message of compiler.errors) {
    problems.add('content/story/story.ink', message);
  }
  for (const message of compiler.warnings) {
    problems.add('content/story/story.ink', message);
  }
  if (!story) {
    return { story: null, knots: [] };
  }

  story.onError = (message) => {
    console.warn(`[ink] ${message}`);
  };
  return { story, knots: knotNames(story) };
}

function storyPath(filename: string): string {
  const clean = filename.replace(/\\/g, '/').replace(/^\.\//, '');
  if (clean.startsWith('/content/')) {
    return clean;
  }
  return `/content/story/${clean}`;
}

function knotNames(story: Story): string[] {
  return [...story.mainContentContainer.namedContent.keys()]
    .filter((name) => name.length > 0 && !name.includes(' '))
    .sort();
}

function parentFolder(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 2];
}
