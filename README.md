# Cacophobia

A browser game built with TypeScript, Vite, and PixiJS: a first-person cinematic view with camera look, Ink dialogue, and scenes described in plain JSON files.

The project is split in two:

- `content/` holds images, sound, levels, and dialogue. Artists and writers work here and never need to open `src/`.
- `src/` holds the engine. Programmers work here.

## Install and run

```bash
npm install
npm run dev              # game at /
npm run builder          # dialogue editor at /builder.html
```

Open the URL Vite prints (usually `http://localhost:5173`). Saving any file in `content/` reloads the page. The dialogue builder lives in `src/dialogue-builder/` and saves into `content/story/`.

## Build

```bash
npm run build     # type-checks, then writes the game to dist/
npm run preview   # serves dist/ locally
```

`dist/` uses relative URLs, so it runs from any folder: itch.io, GitHub Pages, or an unzipped folder. For itch.io, zip the contents of `dist/` (with `index.html` at the root of the zip) and upload it as an HTML project.

## Content

```text
content/
  shared/                 art and sound used by more than one level
    backgrounds/
    characters/
    audio/
  levels/
    level-1/
      level.json          scenes, ambience, and interactions
  story/
    story.ink             every dialogue, as an Ink knot
  ui/                     interface art
  schemas/                editor autocomplete for the JSON files
```

Everything here is found automatically. A new level is a folder with a `level.json`. No code change, and nothing to register. Pictures and sounds go in `shared/` when another level uses them too.

Images can be PNG, JPG, or WEBP. An animated WebP loops by itself at the timing stored in the file, including in Safari. Sound files can be MP3, OGG, WAV, or M4A.

### Add a scene

Put the image in `content/shared/backgrounds/`, then add an entry to `scenes` in `level.json`:

```json
{
  "$schema": "../../schemas/level.schema.json",
  "name": "Level 1",
  "startScene": "hana",
  "scenes": {
    "hana": {
      "name": "Hana",
      "fit": "contain",
      "background": "/shared/backgrounds/hana.webp"
    },
    "test": {
      "name": "Test",
      "fit": "cover",
      "background": "/shared/backgrounds/BG1_test.webp",
      "ambience": { "file": "/shared/audio/room.wav", "volume": 0.65 },
      "characters": [
        { "image": "/shared/characters/ticket.webp", "x": 640, "y": 300, "scale": 0.45 }
      ],
      "triggers": [
        {
          "id": "ticket",
          "x": 640,
          "y": 300,
          "width": 864,
          "height": 486,
          "actions": [
            { "sound": "/shared/audio/click.wav" },
            { "dialogue": "level1_stairwell" },
            { "shake": { "intensity": 8, "duration": 280 } },
            { "go": "hana" }
          ]
        }
      ]
    }
  }
}
```

| Field | Effect |
| --- | --- |
| `startScene` | Scene opened when the level starts. Defaults to the first one |
| `name` | Label in the debug panel |
| `ambience` | Looping background sound. On a scene, it replaces the level's ambience |
| `fit` | `cover` fills the screen and crops the edges. `contain` shows the whole image, with bars around it |
| `background` | Image path. Leave it out for a dark placeholder |
| `characters` | Images placed on the background |
| `dialogue` | Ink knot played when the scene opens, before `onEnter` |
| `onEnter` | Actions run when the scene opens |
| `look` | `false` holds the camera still. The menu uses this |
| `texts` | Lines drawn on the scene. They are not clickable |
| `triggers` | Click boxes. A `label` draws a button. Without one, the box stays invisible |

A path starting with `/` starts from `content/`. Shared files use that form: `/shared/backgrounds/hallway.webp`. Several levels can point at the same file. A path without `/` stays inside the level folder, for something only that level uses.

The `$schema` line gives autocomplete and inline errors in Cursor and VS Code.

### New level

Add `content/levels/level-2/level.json`. Point its scenes at the files in `shared/`. The debug panel lists it on the next reload.

### Menu

The game opens `content/levels/menu` when that folder exists. It is a normal level. The title is a `texts` line, and Play, Settings, and Quit are triggers with a `label`. Settings is another scene in the same level, with Fullscreen, a Back button, and a smaller Dev mode button. Fullscreen uses `{ "fullscreen": true }` and the button reads On or Off. Escape leaves fullscreen as well. Play uses `{ "level": "level-1" }`. Quit uses `{ "quit": true }`. Dev mode uses `{ "dev": true }` and shows the debug panel, including in a published build. Change the words, positions, and sounds in that `level.json`.

### Sound and clicks

`ambience` on the level loops under every scene. A scene with its own `ambience` replaces it until the player leaves. `volume` goes from 0 to 1.

`onEnter` and each trigger `actions` list run in order:

| Action | Effect |
| --- | --- |
| `{ "sound": "/shared/audio/click.wav" }` | Plays once, at `volume` if set. Does not wait |
| `{ "dialogue": "level1_stairwell" }` | Plays that Ink knot and waits until it closes |
| `{ "go": "hana" }` | Opens that scene in the same level, then stops the list |
| `{ "level": "level-1" }` | Opens that level, then stops the list |
| `{ "quit": true }` | Tries to close the window. If the tab stays open, a line asks the player to close it |
| `{ "dev": true }` | Shows or hides the debug panel and the scene tools |
| `{ "fullscreen": true }` | Fills the screen, or returns to the window. The button label follows |
| `{ "shake": true }` | Shakes the camera. An object can set `intensity` and `duration` |

A trigger's `x` and `y` are its center, in pixels of the background, same as a character. `width` and `height` are the clickable size. A `label` draws that word as a button. Without a label the box is invisible. The pointer changes over it.

The boxes are drawn by one component, `Triggers`. A scene parents it and sets what a click does. The same component can be used on any scene.

With dev mode on, Triggers → Show boxes draws every box. Click one to select it: drag the box to move it, drag a white handle to resize it. Values shows `id`, `x`, `y`, `width`, and `height`. Copy values puts that line on the clipboard so it can replace the trigger in `level.json`. While the boxes are shown, a click edits instead of running the action. Dev mode is on during local development. In a published build, Settings → Dev mode turns it on.

The browser stays silent until the first click or key press. The ambience and any sound requested before that start on that gesture. The debug panel has a Master slider for the whole mix.

### Place a character

`x` and `y` are the center of the character, in pixels of the background image: open the background in an image editor and read the coordinates of the spot. The character stays on that spot at any window size. `scale` is relative to the background, `1` keeps the image's own size.

Transparent margins around an animated character are trimmed when it loads, so a 1920×1080 export with a small character in the middle is fine. Backgrounds are never trimmed, so their pixel coordinates stay exact.

### Write dialogue

Dialogues are Ink. Prefer the **Dialogue Builder** in this repo (`src/dialogue-builder/`): a visual editor with no manual Ink typing. It writes `.ink` into `content/story/`. The on-screen panel stays the game's dialogue box (bottom line, red choice list).

```text
content/story/
  story.ink                 global VAR lines and INCLUDE only
  levels/
    level-1.ink             knots for level 1
    level-2.ink             knots for level 2
```

A knot name is what a level calls. Builder knots are prefixed by level, so `=== level1_stairwell ===` is `{ "dialogue": "level1_stairwell" }`.

```ink
=== level1_intro ===
Lucy: I should probably finish this before midnight.
Unknown: Are you still there? # sound: shared/audio/whisper.wav
Lucy: ...Yeah.
-> END
```

`Name: line` sets the speaker. A line without that prefix is narration. A tag gives the game an order: `# sound: shared/audio/whisper.wav`, `# shake`, `# event: surprised`, `# go: hana`, `# level: level-2`, `# quit`. Paths in `# sound` start under `content/` (same as level JSON without the leading slash). A choice is a line starting with `*`. The words in brackets are the reply on screen; what follows is said once it is picked. `# event: name` is the name the game receives. Click, Space, or Enter advances. Arrows move the highlight, Enter picks it, and so does a click. Escape closes. `# go`, `# level`, and `# quit` close the dialogue and then change scene, change level, or ask to quit.

A fact set with `~ reply = "surprised"` stays true for the rest of the game, so a later knot can test it.

#### Dialogue Builder

```bash
npm run builder          # opens /builder.html
# or, with the game already running:
# open http://localhost:5173/builder.html
# Debug panel → Dialogues → Open builder
```

1. Edit the story in the builder (facts, levels, knots, lines, choices, commands, conditions).
2. Click **Save to game**. That writes `content/story/story.ink` and `content/story/levels/level-N.ink` and the game reloads.
3. Point the scene or trigger at the knot: `{ "dialogue": "level1_stairwell" }`.
4. Sound tags must name files that exist under `content/` (for example `shared/audio/whisper.wav`). Scene and level tags must name ids that exist in `content/levels/`.

**Download .ink** is a backup only. Day-to-day writing uses **Save to game**.

### When something is wrong

Mistakes in content do not crash the game. In development, a red box lists each one with its file and field, for example a typo in a field name, a missing image, or a dialogue id that does not exist. A missing image is replaced by a placeholder.

File names are case-sensitive on itch.io. `Hana.webp` and `hana.webp` are different files there, even if your computer treats them as the same. The red box warns about this.

## Debug panel

In development, a panel on the right lists every level, scene, and dialogue found in `content/`, plus camera tuning and test events. Press H to hide or show it. It is not included in a build.

### Scene

The Scene button, on the left, lists what the current scene draws: the background, characters, texts, and triggers. It is separate from the debug panel. Click a name, or click the asset on the picture, to select it. Drag it to move it. A character's corner handle changes its scale. A trigger's handles change its box. Hide takes it off the picture while you work; Close shows everything again. Copy values, then paste that line into `level.json`. A reload reads the file again, so a move is kept only after it is pasted. The Scene button is not included in a build.

## Engine

```text
src/
  main.ts                      loads content, starts the game, opens dev tools
  core/Game.ts                 PixiJS app, loop, input, scene changes, dialogue
  core/Scene.ts                base class for scenes
  core/EventBus.ts             typed events
  core/GameEvents.ts           the list of game events
  content/ContentLibrary.ts    finds and checks everything in content/
  content/parse.ts             reads level JSON
  content/types.ts             level, scene, and action types
  audio/AudioPlayer.ts         looping ambience and overlapping effects
  triggers/Triggers.ts         click boxes, debug gizmos
  scenes/StageScene.ts         draws a scene from level.json
  scenes/fitScene.ts           cover and contain scaling
  assets/AssetLoader.ts        images and animated WebP
  animation/AnimatedWebp.ts    frame-by-frame WebP playback
  camera/                      mouse look, shake, headbob, tuning
  dialogue/                    dialogue box and sequencing
  debug/                       debug panel, trigger boxes, and content problem list
  editor/                      scene list, selection, and move handles
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
  // react when a scene opens
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
