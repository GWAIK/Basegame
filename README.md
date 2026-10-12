# Cinematic Scene

A small browser scene built with TypeScript, Vite, and PixiJS. It is a foundation for a 2D cinematic view: one scene, a camera, dialogue, and a debug panel. There is no game engine, backend, or save system.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Where to put images

Static files live in `public/assets/` and are served from `/assets/...`.

```text
public/assets/levels/level-1/backgrounds/   scene photo for level 1
public/assets/levels/level-1/characters/    character stills for level 1
public/assets/levels/level-1/foreground/    foreground art for level 1
public/assets/ui/                           shared UI art
```

Each level is its own folder. Level 2 would be `public/assets/levels/level-2/` with the same `backgrounds`, `characters`, and `foreground` folders. The definition for the current level is `src/levels/level1.ts`.

Supported image types are PNG, JPG/JPEG, and WEBP.

The prototype runs without those files. A missing background becomes a flat dark scene.

## Replace the background

Put the image at:

```text
public/assets/levels/level-1/backgrounds/BG1_test.webp
```

The scene loads that filename:

```ts
await this.loadBackground('BG1_test.webp');
```

`loadBackground` is on `MainScene`. The filename comes from `sceneBackground` in `src/levels/level1.ts`. The image is scaled to cover the view, including a margin for camera movement, and keeps its aspect ratio. Replace the file with one of the same name, or change `sceneBackground` to the new filename.

## Add a character

Put the image in:

```text
public/assets/levels/level-1/characters/
```

Then list it in `characters` in `src/levels/level1.ts`:

```ts
characters: [
  { file: 'ticket.webp', x: 640, y: 300, scale: 0.45 },
],
```

`x` and `y` are the center of the character, in pixels of the background image. Open the background in an image editor and read the coordinates of the spot you want. The character stays on that spot when the window is resized. `scale` is relative to the background: `1` keeps the character's own pixel size.

If the file is missing, a simple drawn figure stands in for it.

### Animated characters

An animated WebP loops on its own, at the frame timing stored in the file. Fully transparent margins around the animation are trimmed when it loads, so a 1920×1080 export with a small character in the middle is fine.

Frames are decoded one at a time with the browser's `ImageDecoder`, so memory stays low however long the animation is. Browsers without `ImageDecoder` show a still frame instead.

Keep animated files reasonably small. Each frame is decoded while the game runs, so a smaller canvas costs less.

## Create dialogue

Dialogue is a list of lines. The demo script is `src/dialogue/mainScript.ts`:

```ts
const dialogue = [
  {
    speaker: 'Lucy',
    text: 'I should probably finish this before midnight.',
  },
  {
    speaker: 'Unknown',
    text: 'Are you still there?',
  },
  {
    speaker: 'Lucy',
    text: '...Yeah.',
  },
];
```

Start it from the scene:

```ts
this.dialogue.start(dialogue);
```

The box is drawn in the UI layer, so it does not move with the camera. Click, Space, or Enter advances. Escape closes it. When the list ends, the box hides.

Lines are sequential only. Branching and choices are not part of this prototype.

## Change camera movement

All camera tuning is in `src/camera/CameraConfig.ts`:

```ts
export const CAMERA_CONFIG = {
  maxOffsetX: 40,
  maxOffsetY: 25,
  edgeZone: 0.2,
  smoothing: 0.05,
  shakeDecay: 1,
  headbobX: 1.5,
  headbobY: 3,
  headbobPeriod: 3600,
};
```

| Field | Effect |
| --- | --- |
| `maxOffsetX` / `maxOffsetY` | How far the mouse can shift the view, in pixels |
| `edgeZone` | Outer fraction of each screen edge that has an effect. `0.2` leaves the middle 60% still |
| `smoothing` | How quickly the camera catches its target. `0.05` is slow. Higher is snappier |
| `shakeDecay` | How shake fades. `1` is linear |
| `headbobX` / `headbobY` | Idle sway in pixels. Set either to `0` to remove that axis |
| `headbobPeriod` | Milliseconds for one vertical bob. The horizontal sway takes twice as long |

The mouse sets a target. Each frame moves the current offset toward that target. The camera position is:

```text
base position + mouse offset + shake offset + headbob
```

Only the `world` container moves. Dialogue and the debug panel stay on screen.

## Trigger camera shake

```ts
camera.shake(10, 300); // 10 pixels, 300 milliseconds
camera.shake(20, 500);
```

In development, the Debug panel's Camera shake button calls `camera.shake(10, 300)`. Shake is random and fades out. It does not change the mouse offset or the headbob. Reset camera clears shake and recenters the look until the mouse moves again. The idle headbob keeps playing.

The same panel can switch levels, trigger events, and edit `CAMERA_CONFIG` live. Press H to hide or show it. It is not included in a production build.

Large shake values can move past the background margin (`maxOffset` plus 48 pixels). Increase that margin in `MainScene` if a stronger shake shows the edge.

## Project architecture

```text
src/
  main.ts                 boots the game and binds the debug panel
  core/Game.ts            PixiJS application, resize, and update loop
  core/Scene.ts           world layers shared by scenes
  camera/Camera.ts        mouse look, shake, and headbob
  camera/CameraShake.ts   timed random offset
  camera/CameraHeadbob.ts idle sway
  camera/CameraConfig.ts  camera tuning
  scenes/MainScene.ts     composes layers, camera, and dialogue
  levels/level1.ts        level 1 background and characters
  animation/AnimatedWebp.ts  looping animated WebP
  dialogue/DialogueManager.ts
  dialogue/DialogueBox.ts
  dialogue/mainScript.ts
  assets/AssetLoader.ts
  debug/DebugPanel.ts
```

`Game` creates two stage containers:

```text
stage
  world          <- camera moves this
    background
    middle
    character
    foreground
  ui             <- dialogue stays here
```

During `npm run dev`, a [lil-gui](https://lil-gui.georgealways.com/) panel sits above the canvas. It is not a PixiJS object, so the camera does not move it. Add a level to the `levels` list in `src/main.ts`, or an event to the `events` list, and it shows up in the panel. `game.goToLevel()` is where a level change will load the next scene.

Camera code does not reference dialogue. Dialogue does not reference the camera. `MainScene` is the place that wires them together.

The empty `middle` and `foreground` layers are there so parallax can be added later by moving those containers at different speeds. New scenes can extend `Scene` and be swapped from `Game` without rewriting the application loop.

Not included, on purpose: combat, inventory, quests, saves, audio, animation, mobile controls, and progression. Those can be new modules beside the existing ones.
