# Cacophobia

A browser game built with TypeScript, Vite, and PixiJS: a first-person cinematic view with camera look, dialogue, and scenes described in plain JSON files.

The project is split in two:

- `content/` holds images, sound, levels, and dialogue. Artists and writers work here and never need to open `src/`.
- `src/` holds the engine. Programmers work here.

## Install and run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Saving any file in `content/` reloads the page.

## Build

```bash
npm run build     # type-checks, then writes the game to dist/
npm run preview   # serves dist/ locally
```

`dist/` uses relative URLs, so it runs from any folder: itch.io, GitHub Pages, or an unzipped folder. For itch.io, zip the contents of `dist/` (with `index.html` at the root of the zip) and upload it as an HTML project.

## Content

```text
content/
  levels/
    level-1/
      level.json          scenes of this level
      backgrounds/        scene images
      characters/         character images
      foreground/         foreground art
  dialogues/
    intro.json            one file per dialogue
  ui/                     shared interface art
  schemas/                editor autocomplete for the JSON files
```

Everything here is found automatically. A new level folder, dialogue file, or image needs no code change.

Images can be PNG, JPG, or WEBP. An animated WebP loops by itself at the timing stored in the file, including in Safari. Sound files (MP3, OGG, WAV, M4A) are already packaged, ready for an audio feature.

### Add a scene

Put the image in the level's `backgrounds/` folder, then add an entry to `scenes` in `level.json`:

```json
{
  "$schema": "../../schemas/level.schema.json",
  "name": "Level 1",
  "startScene": "hana",
  "scenes": {
    "hana": {
      "name": "Hana",
      "fit": "contain",
      "background": "backgrounds/hana.webp"
    },
    "test": {
      "name": "Test",
      "fit": "cover",
      "background": "backgrounds/BG1_test.webp",
      "characters": [
        { "image": "characters/ticket.webp", "x": 640, "y": 300, "scale": 0.45 }
      ],
      "dialogue": "intro"
    }
  }
}
```

| Field | Effect |
| --- | --- |
| `startScene` | Scene opened when the level starts. Defaults to the first one |
| `name` | Label in the debug panel |
| `fit` | `cover` fills the screen and crops the edges. `contain` shows the whole image, with bars around it |
| `background` | Image path. Leave it out for a dark placeholder |
| `characters` | Images placed on the background |
| `dialogue` | Dialogue played when the scene opens |

Paths are relative to the level folder. A path starting with `/` starts from `content/`, for shared art: `/ui/frame.png`.

The `$schema` line gives autocomplete and inline errors in Cursor and VS Code.

### Place a character

`x` and `y` are the center of the character, in pixels of the background image: open the background in an image editor and read the coordinates of the spot. The character stays on that spot at any window size. `scale` is relative to the background, `1` keeps the image's own size.

Transparent margins around an animated character are trimmed when it loads, so a 1920×1080 export with a small character in the middle is fine. Backgrounds are never trimmed, so their pixel coordinates stay exact.

### Write dialogue

One file per dialogue in `content/dialogues/`. The file name is the id, so `intro.json` is `"intro"`:

```json
{
  "$schema": "../schemas/dialogue.schema.json",
  "lines": [
    { "speaker": "Lucy", "text": "I should probably finish this before midnight." },
    { "speaker": "Unknown", "text": "Are you still there?" }
  ]
}
```

Leave `speaker` out for narration. Click, Space, or Enter advances. Escape closes.

### When something is wrong

Mistakes in content do not crash the game. In development, a red box lists each one with its file and field, for example a typo in a field name, a missing image, or a dialogue id that does not exist. A missing image is replaced by a placeholder.

File names are case-sensitive on itch.io. `Hana.webp` and `hana.webp` are different files there, even if your computer treats them as the same. The red box warns about this.

## Debug panel

In development, a panel on the right lists every level, scene, and dialogue found in `content/`, plus camera tuning and test events. Press H to hide or show it. It is not included in a build.

## Engine

```text
src/
  main.ts                      loads content, starts the game, opens dev tools
  core/Game.ts                 PixiJS app, loop, input, scene changes, dialogue
  core/Scene.ts                base class for scenes
  core/EventBus.ts             typed events
  core/GameEvents.ts           the list of game events
  content/ContentLibrary.ts    finds and checks everything in content/
  content/parse.ts             reads level and dialogue JSON
  content/types.ts             level, scene, and dialogue types
  scenes/StageScene.ts         draws a scene from level.json
  scenes/fitScene.ts           cover and contain scaling
  assets/AssetLoader.ts        images and animated WebP
  animation/AnimatedWebp.ts    frame-by-frame WebP playback
  camera/                      mouse look, shake, headbob, tuning
  dialogue/                    dialogue box and sequencing
  debug/                       debug panel and content problem list
```

```text
stage
  world          <- the camera moves this
    scene root   <- scaled to fit the screen
      background
      middle
      character
      foreground
  ui             <- dialogue, fixed on screen
```

### Moving around

```ts
game.goTo('level-1');          // the level's start scene
game.goTo('level-1', 'test');  // a given scene
game.playDialogue('intro');
game.shakeCamera(20, 500);     // pixels, milliseconds
```

The current scene stays on screen until the next one has loaded, so there is never a blank frame.

### Adding a feature

Features listen to the game instead of being wired into it:

```ts
game.events.on('scene:enter', ({ levelId, sceneId }) => {
  // start ambience for this scene
});
game.events.on('dialogue:end', ({ dialogueId }) => {
  // unlock the next step
});
game.events.on('update', ({ deltaMS }) => {
  // per-frame work
});
```

Available events are listed in `src/core/GameEvents.ts`. To add one, declare it there, then call `game.events.emit()` where it happens.

When a feature needs new data in `level.json`, for example clickable areas:

1. Add the field to the types in `src/content/types.ts`.
2. Read and check it in `src/content/parse.ts`, and add its name to the list of allowed keys.
3. Describe it in `content/schemas/level.schema.json` for autocomplete.
4. Use it in `src/scenes/StageScene.ts`, or in a new scene class extending `Scene`.

## Camera tuning

All camera settings are in `src/camera/CameraConfig.ts`, and can be changed live from the debug panel.

| Field | Effect |
| --- | --- |
| `maxOffsetX` / `maxOffsetY` | How far the mouse can shift the view, in pixels |
| `edgeZone` | Outer fraction of each screen edge that moves the camera. `0.2` leaves the middle 60% still |
| `smoothing` | How quickly the camera catches up. Higher is snappier |
| `shakeDecay` | How shake fades. `1` is linear |
| `headbobX` / `headbobY` | Idle sway in pixels. `0` removes that axis |
| `headbobPeriod` | Milliseconds for one vertical bob. The horizontal sway takes twice as long |
