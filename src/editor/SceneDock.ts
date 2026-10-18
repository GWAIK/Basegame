import type { SceneDef } from '../content/types';
import { createDialogueBuilderWindow } from './DialogueBuilderWindow';
import { CAMERA_CONFIG } from '../camera/CameraConfig';
import { DIALOGUE_CONFIG } from '../dialogue/DialogueConfig';
import { TIMER_CONFIG } from '../timer/TimerConfig';
import type { Game } from '../core/Game';
import { devTools } from '../debug/devTools';
import { triggerDebug } from '../debug/triggerDebug';
import {
  onSceneStructure,
  onSceneTransform,
  placeCharacter,
  placeText,
  placeTrigger,
  resetSceneEditor,
  sceneEditor,
  notifySceneTransform,
  sceneItemKey,
  sceneSnippet,
  selectSceneItem,
  setSceneEditorOpen,
  toggleSceneItemHidden,
  type SceneKind,
  type SceneSelection,
} from './sceneEditor';

const KINDS: readonly { kind: SceneKind; title: string }[] = [
  { kind: 'background', title: 'Background' },
  { kind: 'character', title: 'Characters' },
  { kind: 'text', title: 'Texts' },
  { kind: 'trigger', title: 'Triggers' },
];

/**
 * Unreal-style editor. The outliner lists the open scene, the + menu places
 * an actor, and the details panel edits the selection. Select mode grabs
 * viewport clicks. The header chevron slides the editor off the right edge.
 * The tab that stays there, or H, brings it back.
 */
export function createSceneDock(game: Game): { show: () => void; hide: () => void } {
  const shell = document.createElement('aside');
  shell.className = 'editor';

  const resize = document.createElement('div');
  resize.className = 'editor-resize';

  const outliner = document.createElement('section');
  outliner.className = 'editor-outliner';

  const outlinerBar = document.createElement('header');
  outlinerBar.className = 'editor-bar';
  const outlinerTitle = document.createElement('span');
  outlinerTitle.textContent = 'Outliner';
  const barActions = document.createElement('div');
  barActions.className = 'editor-bar-actions';
  const selectMode = document.createElement('button');
  selectMode.type = 'button';
  selectMode.className = 'editor-mode';
  selectMode.textContent = 'Select';
  selectMode.title = 'Select and drag actors in the scene';
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'editor-add';
  addButton.textContent = '+';
  addButton.title = 'Add';
  addButton.setAttribute('aria-label', 'Add');
  addButton.setAttribute('aria-expanded', 'false');
  const dialogueWindow = createDialogueBuilderWindow();
  const dialogueButton = document.createElement('button');
  dialogueButton.type = 'button';
  dialogueButton.className = 'editor-mode';
  dialogueButton.textContent = 'Dialogue';
  dialogueButton.title = 'Open the dialogue builder';
  const hideButton = document.createElement('button');
  hideButton.type = 'button';
  hideButton.className = 'editor-hide';
  hideButton.title = 'Hide (H)';
  hideButton.setAttribute('aria-label', 'Hide');
  hideButton.append(chevronIcon(true));
  barActions.append(dialogueButton, selectMode, addButton, hideButton);
  outlinerBar.append(outlinerTitle, barActions);

  const nav = document.createElement('div');
  nav.className = 'editor-nav';
  const levelSelect = document.createElement('select');
  levelSelect.title = 'Level';
  const sceneSelect = document.createElement('select');
  sceneSelect.title = 'Scene';
  nav.append(levelSelect, sceneSelect);

  const search = document.createElement('input');
  search.className = 'editor-search';
  search.type = 'search';
  search.placeholder = 'Search';
  search.autocomplete = 'off';

  const list = document.createElement('div');
  list.className = 'editor-list';

  const foot = document.createElement('footer');
  foot.className = 'editor-foot';
  const boxesLabel = document.createElement('label');
  const boxes = document.createElement('input');
  boxes.type = 'checkbox';
  boxesLabel.append(boxes, document.createTextNode('Show boxes'));
  foot.append(boxesLabel);

  outliner.append(outlinerBar, nav, search, list, foot);

  const split = document.createElement('div');
  split.className = 'editor-split';
  split.setAttribute('role', 'separator');

  const dialoguePanel = document.createElement('section');
  dialoguePanel.className = 'editor-dialogue';
  const dialogueLabel = document.createElement('span');
  dialogueLabel.textContent = 'Dialogue Builder';
  const dialogueOpen = document.createElement('button');
  dialogueOpen.type = 'button';
  dialogueOpen.className = 'editor-mode';
  dialogueOpen.textContent = 'Open';
  dialoguePanel.append(dialogueLabel, dialogueOpen);

  const details = document.createElement('section');
  details.className = 'editor-details';
  const detailsBar = document.createElement('header');
  detailsBar.className = 'editor-bar';
  const detailsTitle = document.createElement('span');
  detailsTitle.textContent = 'Details';
  detailsBar.append(detailsTitle);
  const detailsBody = document.createElement('div');
  detailsBody.className = 'editor-details-body';
  details.append(detailsBar, detailsBody);

  const menu = document.createElement('div');
  menu.className = 'editor-menu';
  menu.hidden = true;

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'editor-tab';
  tab.title = 'Show editor (H)';
  tab.setAttribute('aria-label', 'Show editor');
  tab.hidden = true;
  tab.append(chevronIcon(false));

  shell.append(resize, outliner, split, dialoguePanel, details, menu);
  document.body.append(shell, tab);

  let shown = true;
  let available = true;
  let syncing = false;
  let cameraOpen = false;
  let dialogueStyleOpen = false;
  let timerOpen = false;

  const closeMenu = () => {
    menu.hidden = true;
    addButton.classList.remove('is-open');
    addButton.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    const rect = addButton.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    menu.hidden = false;
    addButton.classList.add('is-open');
    addButton.setAttribute('aria-expanded', 'true');
  };

  const redraw = () => {
    const open = available && shown;
    shell.hidden = !available;
    shell.classList.toggle('is-collapsed', available && !shown);
    tab.hidden = open || !available;
    applyInset(open ? shell : null);
    if (!open) {
      return;
    }
    syncNav();
    const builderOpen = dialogueWindow.isOpen();
    dialogueButton.classList.toggle('is-on', builderOpen);
    dialogueOpen.classList.toggle('is-on', builderOpen);
    dialogueOpen.textContent = builderOpen ? 'Close' : 'Open';
    selectMode.classList.toggle('is-on', sceneEditor.open);
    selectMode.setAttribute('aria-pressed', sceneEditor.open ? 'true' : 'false');
    boxes.checked = triggerDebug.visible;
    list.replaceChildren();
    detailsBody.replaceChildren();
    const scene = currentScene(game);
    if (!scene) {
      return;
    }
    list.append(renderList(scene, search.value));
    const selectedRow = list.querySelector('.editor-row.is-selected');
    if (selectedRow instanceof HTMLElement) {
      selectedRow.scrollIntoView({ block: 'nearest' });
    }
    detailsBody.append(renderDetails(game, scene, () => {
      cameraOpen = !cameraOpen;
      redraw();
    }, cameraOpen, () => {
      dialogueStyleOpen = !dialogueStyleOpen;
      redraw();
    }, dialogueStyleOpen, () => {
      timerOpen = !timerOpen;
      redraw();
    }, timerOpen));
  };

  hideButton.addEventListener('click', () => {
    collapse();
    blurFocus();
  });
  tab.addEventListener('click', () => {
    expand();
    blurFocus();
  });
  const toggleDialogue = () => {
    dialogueWindow.toggle();
    redraw();
    blurFocus();
  };
  dialogueButton.addEventListener('click', toggleDialogue);
  dialogueOpen.addEventListener('click', toggleDialogue);
  selectMode.addEventListener('click', () => {
    setSceneEditorOpen(!sceneEditor.open);
    blurFocus();
  });
  addButton.addEventListener('click', () => {
    if (menu.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });
  boxes.addEventListener('change', () => {
    triggerDebug.visible = boxes.checked;
  });
  search.addEventListener('input', redraw);
  levelSelect.addEventListener('change', () => {
    if (syncing) {
      return;
    }
    void game.goTo(levelSelect.value);
  });
  sceneSelect.addEventListener('change', () => {
    if (syncing) {
      return;
    }
    const location = game.location;
    if (!location) {
      return;
    }
    void game.goTo(location.levelId, sceneSelect.value);
  });

  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && (menu.contains(target) || addButton.contains(target))) {
      return;
    }
    closeMenu();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !menu.hidden) {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.repeat || event.code !== 'KeyH' || !devTools.enabled) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (!available) {
      return;
    }
    if (shown) {
      collapse();
    } else {
      expand();
    }
  });

  bindResize(shell, resize);
  bindSplit(shell, outliner, split);
  fillMenu(game, menu, closeMenu);

  onSceneStructure(redraw);
  onSceneTransform(() => refreshBound(detailsBody, currentScene(game)));
  game.events.on('scene:enter', () => {
    syncNav();
    resetSceneEditor();
  });
  fillLevels(game, levelSelect);
  redraw();

  function show(): void {
    available = true;
    expand();
  }

  function hide(): void {
    available = false;
    shown = false;
    closeMenu();
    dialogueWindow.close();
    setSceneEditorOpen(false);
  }

  function collapse(): void {
    shown = false;
    closeMenu();
    setSceneEditorOpen(false);
  }

  function expand(): void {
    shown = true;
    redraw();
  }

  function syncNav(): void {
    const location = game.location;
    if (!location) {
      return;
    }
    syncing = true;
    levelSelect.value = location.levelId;
    if (sceneSelect.dataset.level !== location.levelId) {
      fillScenes(game, sceneSelect, location.levelId);
      sceneSelect.dataset.level = location.levelId;
    }
    sceneSelect.value = location.sceneId;
    syncing = false;
  }

  return { show, hide };
}

function fillMenu(game: Game, menu: HTMLElement, closeMenu: () => void): void {
  const place = document.createElement('div');
  place.className = 'editor-menu-label';
  place.textContent = 'Place';
  menu.append(place);
  menu.append(
    menuButton('Trigger', () => {
      const scene = currentScene(game);
      if (!scene) {
        return;
      }
      const selection = placeTrigger(scene, game.sceneDimensions);
      triggerDebug.visible = true;
      closeMenu();
      setSceneEditorOpen(true);
      selectSceneItem(selection);
    }),
    menuButton('Text', () => {
      const scene = currentScene(game);
      if (!scene) {
        return;
      }
      void reloadSelection(game, placeText(scene, game.sceneDimensions), closeMenu);
    }),
  );

  const images = game.content.images();
  if (images.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'editor-menu-label';
    empty.textContent = 'No images in content/';
    menu.append(empty);
    return;
  }

  const groups = new Map<string, { path: string; name: string }[]>();
  for (const path of images) {
    const parts = path.split('/').filter((part) => part.length > 0);
    const name = parts[parts.length - 1] ?? path;
    const folder = parts.slice(0, -1).join('/') || 'images';
    const bucket = groups.get(folder) ?? [];
    bucket.push({ path, name });
    groups.set(folder, bucket);
  }
  for (const folder of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const label = document.createElement('div');
    label.className = 'editor-menu-label';
    label.textContent = folder;
    menu.append(label);
    for (const image of groups.get(folder) ?? []) {
      menu.append(
        menuButton(image.name, () => {
          const scene = currentScene(game);
          if (!scene) {
            return;
          }
          void reloadSelection(game, placeCharacter(scene, image.path, game.sceneDimensions), closeMenu);
        }),
      );
    }
  }
}

function menuButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = label;
  button.addEventListener('click', () => {
    onClick();
    blurFocus();
  });
  return button;
}

async function reloadSelection(game: Game, selection: SceneSelection, closeMenu: () => void): Promise<void> {
  const location = game.location;
  if (!location) {
    return;
  }
  closeMenu();
  setSceneEditorOpen(true);
  await game.goTo(location.levelId, location.sceneId);
  selectSceneItem(selection);
}

function renderList(scene: SceneDef, query: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const needle = query.trim().toLowerCase();
  let shown = 0;
  for (const group of KINDS) {
    const rows = rowsFor(scene, group.kind).filter((row) => needle.length === 0 || row.label.toLowerCase().includes(needle));
    if (rows.length === 0) {
      continue;
    }
    const title = document.createElement('div');
    title.className = 'editor-group';
    title.textContent = group.title;
    fragment.append(title);
    for (const row of rows) {
      fragment.append(renderRow(row));
      shown += 1;
    }
  }
  if (shown === 0) {
    const empty = document.createElement('p');
    empty.className = 'editor-empty';
    empty.textContent = needle.length > 0 ? 'No results' : 'This scene is empty';
    fragment.append(empty);
  }
  return fragment;
}

interface Row {
  selection: SceneSelection;
  key: string;
  label: string;
}

function rowsFor(scene: SceneDef, kind: SceneKind): Row[] {
  if (kind === 'background') {
    return [
      {
        selection: { kind, index: 0 },
        key: sceneItemKey(kind, 0),
        label: fileName(scene.background) || 'None',
      },
    ];
  }
  if (kind === 'character') {
    return scene.characters.map((character, index) => ({
      selection: { kind, index },
      key: sceneItemKey(kind, index),
      label: fileName(character.image) || 'Character',
    }));
  }
  if (kind === 'text') {
    return scene.texts.map((text, index) => ({
      selection: { kind, index },
      key: sceneItemKey(kind, index),
      label: text.text || 'Text',
    }));
  }
  return scene.triggers.map((trigger, index) => ({
    selection: { kind, index },
    key: sceneItemKey(kind, index, trigger.id),
    label: trigger.label || trigger.id,
  }));
}

function renderRow(row: Row): HTMLDivElement {
  const selected = sceneEditor.selected;
  const isSelected = selected?.kind === row.selection.kind && selected.index === row.selection.index;
  const hidden = sceneEditor.hidden.has(row.key);
  const line = document.createElement('div');
  line.className = 'editor-row';
  if (isSelected) {
    line.classList.add('is-selected');
  }
  if (hidden) {
    line.classList.add('is-hidden');
  }

  const eye = document.createElement('button');
  eye.type = 'button';
  eye.className = 'editor-eye';
  eye.title = hidden ? 'Show' : 'Hide';
  eye.append(eyeIcon(hidden));
  eye.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSceneItemHidden(row.key);
  });

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'editor-name';
  name.textContent = row.label;
  name.title = row.label;
  name.addEventListener('click', () => selectSceneItem(row.selection));

  line.append(eye, name);
  return line;
}

function renderDetails(
  game: Game,
  scene: SceneDef,
  toggleCamera: () => void,
  cameraOpen: boolean,
  toggleDialogue: () => void,
  dialogueOpen: boolean,
  toggleTimer: () => void,
  timerOpen: boolean,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const selection = sceneEditor.selected;
  if (!selection) {
    fragment.append(renderWorld(game, scene, toggleCamera, cameraOpen, toggleDialogue, dialogueOpen, toggleTimer, timerOpen));
    return fragment;
  }

  const row = rowsFor(scene, selection.kind)[selection.index];
  if (!row) {
    fragment.append(renderWorld(game, scene, toggleCamera, cameraOpen, toggleDialogue, dialogueOpen, toggleTimer, timerOpen));
    return fragment;
  }

  const name = document.createElement('p');
  name.className = 'editor-selection';
  name.textContent = row.label;
  const kind = document.createElement('p');
  kind.className = 'editor-kind';
  kind.textContent = kindLabel(selection.kind);
  fragment.append(name, kind);
  if (!sceneEditor.open) {
    const hint = document.createElement('p');
    hint.className = 'editor-hint';
    hint.textContent = 'Turn on Select to move this in the scene.';
    fragment.append(hint);
  }

  if (selection.kind === 'background') {
    fragment.append(category('Background'));
    fragment.append(imageField(game, 'Image', scene.background ?? '', (path) => {
      scene.background = path || null;
      void reloadKeeping(game, selection);
    }));
  } else if (selection.kind === 'character') {
    const character = scene.characters[selection.index];
    if (!character) {
      return fragment;
    }
    fragment.append(category('Character'));
    fragment.append(imageField(game, 'Image', character.image, (path) => {
      character.image = path;
      void reloadKeeping(game, selection);
    }));
    fragment.append(category('Transform'));
    fragment.append(numberField('X', 'x', character.x, (value) => {
      character.x = value;
    }));
    fragment.append(numberField('Y', 'y', character.y, (value) => {
      character.y = value;
    }));
    fragment.append(numberField('Scale', 'scale', character.scale, (value) => {
      character.scale = value;
    }, 0.01));
  } else if (selection.kind === 'text') {
    const text = scene.texts[selection.index];
    if (!text) {
      return fragment;
    }
    fragment.append(category('Text'));
    fragment.append(textField('Text', 'text', text.text, (value) => {
      text.text = value;
    }));
    fragment.append(numberField('Size', 'size', text.size, (value) => {
      text.size = value;
    }));
    fragment.append(category('Transform'));
    fragment.append(numberField('X', 'x', text.x, (value) => {
      text.x = value;
    }));
    fragment.append(numberField('Y', 'y', text.y, (value) => {
      text.y = value;
    }));
  } else {
    const trigger = scene.triggers[selection.index];
    if (!trigger) {
      return fragment;
    }
    fragment.append(category('Trigger'));
    fragment.append(textField('Id', 'id', trigger.id, (value) => {
      trigger.id = value;
    }));
    fragment.append(textField('Label', 'label', trigger.label ?? '', (value) => {
      trigger.label = value.length > 0 ? value : null;
    }));
    fragment.append(checkField('One time', trigger.once, (value) => {
      game.setTriggerOnce(trigger, value);
      notifySceneTransform();
    }));
    fragment.append(category('Transform'));
    fragment.append(numberField('X', 'x', trigger.x, (value) => {
      trigger.x = value;
    }));
    fragment.append(numberField('Y', 'y', trigger.y, (value) => {
      trigger.y = value;
    }));
    fragment.append(numberField('Width', 'width', trigger.width, (value) => {
      trigger.width = value;
    }));
    fragment.append(numberField('Height', 'height', trigger.height, (value) => {
      trigger.height = value;
    }));
  }

  fragment.append(valuesBlock(scene, selection));
  return fragment;
}

function renderWorld(
  game: Game,
  scene: SceneDef,
  toggleCamera: () => void,
  cameraOpen: boolean,
  toggleDialogue: () => void,
  dialogueOpen: boolean,
  toggleTimer: () => void,
  timerOpen: boolean,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const name = document.createElement('p');
  name.className = 'editor-selection';
  name.textContent = scene.name;
  const kind = document.createElement('p');
  kind.className = 'editor-kind';
  kind.textContent = 'Scene';
  fragment.append(name, kind);

  fragment.append(category('Audio'));
  const volume = rangeField('Master', 1, 0, 1, 0.01, (value) => game.setMasterVolume(value));
  fragment.append(volume);

  if (game.content.knots.length > 0) {
    fragment.append(category('Dialogues'));
    const actions = document.createElement('div');
    actions.className = 'editor-actions';
    for (const id of game.content.knots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = id;
      button.addEventListener('click', () => {
        game.playDialogue(id);
        blurFocus();
      });
      actions.append(button);
    }
    fragment.append(actions);
  }

  const dialogue = document.createElement('button');
  dialogue.type = 'button';
  dialogue.className = 'editor-category';
  dialogue.textContent = `${dialogueOpen ? '▾' : '▸'}  Dialogue`;
  dialogue.addEventListener('click', toggleDialogue);
  fragment.append(dialogue);
  if (dialogueOpen) {
    const values = document.createElement('textarea');
    values.className = 'editor-values';
    values.readOnly = true;
    values.rows = 10;
    const refreshValues = () => {
      values.value = dialogueSnippet();
    };
    const write = (apply: (value: number) => void) => (value: number) => {
      apply(value);
      refreshValues();
    };
    fragment.append(rangeField('Name', DIALOGUE_CONFIG.nameSize, 12, 96, 1, write((value) => {
      DIALOGUE_CONFIG.nameSize = value;
    })));
    fragment.append(rangeField('Text', DIALOGUE_CONFIG.textSize, 12, 72, 1, write((value) => {
      DIALOGUE_CONFIG.textSize = value;
    })));
    fragment.append(rangeField('Bottom', DIALOGUE_CONFIG.bottom, 0, 800, 1, write((value) => {
      DIALOGUE_CONFIG.bottom = value;
    })));
    fragment.append(colorField('Line', DIALOGUE_CONFIG.lineColor, (value) => {
      DIALOGUE_CONFIG.lineColor = value;
      refreshValues();
    }));
    fragment.append(rangeField('Thick', DIALOGUE_CONFIG.lineThickness, 1, 24, 1, write((value) => {
      DIALOGUE_CONFIG.lineThickness = value;
    })));
    fragment.append(rangeField('Length', DIALOGUE_CONFIG.lineLength, 40, 1600, 1, write((value) => {
      DIALOGUE_CONFIG.lineLength = value;
    })));
    refreshValues();
    fragment.append(copyButton('Copy values', dialogueSnippet, () => {
      values.focus();
      values.select();
    }));
    fragment.append(values);
  }

  const timer = document.createElement('button');
  timer.type = 'button';
  timer.className = 'editor-category';
  timer.textContent = `${timerOpen ? '▾' : '▸'}  Timer`;
  timer.addEventListener('click', toggleTimer);
  fragment.append(timer);
  if (timerOpen) {
    const hold = document.createElement('button');
    hold.type = 'button';
    hold.className = 'editor-copy';
    const refreshHold = () => {
      hold.textContent = game.isTimerHeld ? 'Resume timer' : 'Pause timer';
    };
    refreshHold();
    hold.addEventListener('click', () => {
      game.holdTimer(!game.isTimerHeld);
      refreshHold();
    });
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'editor-copy';
    skip.textContent = '-10';
    skip.addEventListener('click', () => {
      game.trimTimer(10);
    });
    fragment.append(hold, skip);
    const values = document.createElement('textarea');
    values.className = 'editor-values';
    values.readOnly = true;
    values.rows = 7;
    const refreshValues = () => {
      values.value = timerSnippet();
    };
    const write = (apply: (value: number) => void) => (value: number) => {
      apply(value);
      refreshValues();
    };
    fragment.append(rangeField('Size', TIMER_CONFIG.size, 10, 96, 1, write((value) => {
      TIMER_CONFIG.size = value;
    })));
    fragment.append(rangeField('Top', TIMER_CONFIG.top, 0, 800, 1, write((value) => {
      TIMER_CONFIG.top = value;
    })));
    fragment.append(rangeField('Right', TIMER_CONFIG.right, 0, 800, 1, write((value) => {
      TIMER_CONFIG.right = value;
    })));
    fragment.append(colorField('Color', TIMER_CONFIG.color, (value) => {
      TIMER_CONFIG.color = value;
      refreshValues();
    }));
    refreshValues();
    fragment.append(copyButton('Copy values', timerSnippet, () => {
      values.focus();
      values.select();
    }));
    fragment.append(values);
  }

  const camera = document.createElement('button');
  camera.type = 'button';
  camera.className = 'editor-category';
  camera.textContent = `${cameraOpen ? '▾' : '▸'}  Camera`;
  camera.addEventListener('click', toggleCamera);
  fragment.append(camera);
  if (cameraOpen) {
    fragment.append(rangeField('Offset X', CAMERA_CONFIG.maxOffsetX, 0, 120, 1, (value) => {
      CAMERA_CONFIG.maxOffsetX = value;
    }));
    fragment.append(rangeField('Offset Y', CAMERA_CONFIG.maxOffsetY, 0, 80, 1, (value) => {
      CAMERA_CONFIG.maxOffsetY = value;
    }));
    fragment.append(rangeField('Edge', CAMERA_CONFIG.edgeZone, 0.05, 0.5, 0.01, (value) => {
      CAMERA_CONFIG.edgeZone = value;
    }));
    fragment.append(rangeField('Smoothing', CAMERA_CONFIG.smoothing, 0.01, 0.3, 0.01, (value) => {
      CAMERA_CONFIG.smoothing = value;
    }));
    fragment.append(rangeField('Headbob X', CAMERA_CONFIG.headbobX, 0, 12, 0.1, (value) => {
      CAMERA_CONFIG.headbobX = value;
    }));
    fragment.append(rangeField('Headbob Y', CAMERA_CONFIG.headbobY, 0, 12, 0.1, (value) => {
      CAMERA_CONFIG.headbobY = value;
    }));
    const actions = document.createElement('div');
    actions.className = 'editor-actions';
    actions.append(
      actionButton('Camera shake', () => game.shakeCamera()),
      actionButton('Reset camera', () => game.resetCamera()),
    );
    fragment.append(actions);
  }
  return fragment;
}

function category(title: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'editor-category';
  row.textContent = title;
  return row;
}

function imageField(game: Game, label: string, current: string, onChange: (path: string) => void): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'editor-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const select = document.createElement('select');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None';
  select.append(none);
  const paths = new Set(game.content.images());
  if (current && !paths.has(current)) {
    paths.add(current);
  }
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const option = document.createElement('option');
    option.value = path;
    option.textContent = fileName(path) || path;
    option.title = path;
    select.append(option);
  }
  select.value = current;
  select.addEventListener('change', () => onChange(select.value));
  field.append(caption, select);
  return field;
}

function checkField(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'editor-field editor-check';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  field.append(caption, input);
  return field;
}

function textField(label: string, bind: string, value: string, onInput: (value: string) => void): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'editor-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.dataset.bind = bind;
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    onInput(input.value);
    notifySceneTransform();
  });
  field.append(caption, input);
  return field;
}

function numberField(
  label: string,
  bind: string,
  value: number,
  onInput: (value: number) => void,
  step = 1,
): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'editor-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = formatNumber(value, step);
  input.dataset.bind = bind;
  input.addEventListener('input', () => {
    const next = Number(input.value);
    if (!Number.isFinite(next)) {
      return;
    }
    onInput(next);
    notifySceneTransform();
  });
  field.append(caption, input);
  return field;
}

function colorField(label: string, value: string, onInput: (value: string) => void): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'editor-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  field.append(caption, input);
  return field;
}

function rangeField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onInput: (value: number) => void,
): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'editor-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  field.append(caption, input);
  return field;
}

function valuesBlock(scene: SceneDef, selection: SceneSelection): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(category('Level JSON'));
  const values = document.createElement('textarea');
  values.className = 'editor-values';
  values.readOnly = true;
  values.rows = 2;
  values.value = sceneSnippet(scene, selection);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'editor-copy';
  copy.textContent = 'Copy values';
  copy.addEventListener('click', () => {
    const snippet = sceneSnippet(scene, sceneEditor.selected);
    if (!snippet) {
      return;
    }
    void navigator.clipboard.writeText(snippet).then(
      () => {
        copy.textContent = 'Copied';
        window.setTimeout(() => {
          copy.textContent = 'Copy values';
        }, 1200);
      },
      () => {
        values.focus();
        values.select();
        copy.textContent = 'Select the line';
        window.setTimeout(() => {
          copy.textContent = 'Copy values';
        }, 1600);
      },
    );
    blurFocus();
  });
  fragment.append(copy, values);
  return fragment;
}

/** Current Dialogue sliders, ready to paste back into the game. */
function dialogueSnippet(): string {
  return `Dialogue\n${JSON.stringify({
    nameSize: DIALOGUE_CONFIG.nameSize,
    textSize: DIALOGUE_CONFIG.textSize,
    bottom: DIALOGUE_CONFIG.bottom,
    lineColor: DIALOGUE_CONFIG.lineColor,
    lineThickness: DIALOGUE_CONFIG.lineThickness,
    lineLength: DIALOGUE_CONFIG.lineLength,
    portraitSize: DIALOGUE_CONFIG.portraitSize,
    portraitGap: DIALOGUE_CONFIG.portraitGap,
  }, null, 2)}`;
}

function timerSnippet(): string {
  return `Timer\n${JSON.stringify({
    size: TIMER_CONFIG.size,
    top: TIMER_CONFIG.top,
    right: TIMER_CONFIG.right,
    color: TIMER_CONFIG.color,
  }, null, 2)}`;
}

function copyButton(label: string, text: () => string, onFail: () => void): HTMLButtonElement {
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'editor-copy';
  copy.textContent = label;
  copy.addEventListener('click', () => {
    const snippet = text();
    void navigator.clipboard.writeText(snippet).then(
      () => {
        copy.textContent = 'Copied';
        window.setTimeout(() => {
          copy.textContent = label;
        }, 1200);
      },
      () => {
        onFail();
        copy.textContent = 'Select the text';
        window.setTimeout(() => {
          copy.textContent = label;
        }, 1600);
      },
    );
    blurFocus();
  });
  return copy;
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    onClick();
    blurFocus();
  });
  return button;
}

function refreshBound(root: ParentNode, scene: SceneDef | null): void {
  const selection = sceneEditor.selected;
  if (!scene || !selection) {
    return;
  }
  const row = rowsFor(scene, selection.kind)[selection.index];
  const selectedName = document.querySelector('.editor-row.is-selected .editor-name');
  const selectedTitle = root.querySelector('.editor-selection');
  if (row && selectedName) {
    selectedName.textContent = row.label;
    if (selectedName instanceof HTMLElement) {
      selectedName.title = row.label;
    }
  }
  if (row && selectedTitle) {
    selectedTitle.textContent = row.label;
  }
  const values = root.querySelector('.editor-values');
  if (values instanceof HTMLTextAreaElement && document.activeElement !== values) {
    values.value = sceneSnippet(scene, selection);
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-bind]')) {
    if (input === document.activeElement) {
      continue;
    }
    const next = boundValue(scene, selection, input.dataset.bind ?? '');
    if (next === null) {
      continue;
    }
    input.value = typeof next === 'number' ? formatNumber(next, Number(input.step) || 1) : next;
  }
}

function boundValue(scene: SceneDef, selection: SceneSelection, bind: string): string | number | null {
  if (selection.kind === 'character') {
    const character = scene.characters[selection.index];
    if (!character) {
      return null;
    }
    if (bind === 'x') {
      return character.x;
    }
    if (bind === 'y') {
      return character.y;
    }
    if (bind === 'scale') {
      return character.scale;
    }
    return null;
  }
  if (selection.kind === 'text') {
    const text = scene.texts[selection.index];
    if (!text) {
      return null;
    }
    if (bind === 'text') {
      return text.text;
    }
    if (bind === 'size') {
      return text.size;
    }
    if (bind === 'x') {
      return text.x;
    }
    if (bind === 'y') {
      return text.y;
    }
    return null;
  }
  if (selection.kind === 'trigger') {
    const trigger = scene.triggers[selection.index];
    if (!trigger) {
      return null;
    }
    if (bind === 'id') {
      return trigger.id;
    }
    if (bind === 'label') {
      return trigger.label ?? '';
    }
    if (bind === 'x') {
      return trigger.x;
    }
    if (bind === 'y') {
      return trigger.y;
    }
    if (bind === 'width') {
      return trigger.width;
    }
    if (bind === 'height') {
      return trigger.height;
    }
  }
  return null;
}

async function reloadKeeping(game: Game, selection: SceneSelection): Promise<void> {
  const location = game.location;
  if (!location) {
    return;
  }
  await game.goTo(location.levelId, location.sceneId);
  selectSceneItem(selection);
}

function fillLevels(game: Game, select: HTMLSelectElement): void {
  select.replaceChildren();
  for (const level of game.content.levels) {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = level.name;
    select.append(option);
  }
}

function fillScenes(game: Game, select: HTMLSelectElement, levelId: string): void {
  select.replaceChildren();
  const level = game.content.level(levelId);
  for (const scene of level?.scenes ?? []) {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = scene.name;
    select.append(option);
  }
}

function bindResize(shell: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const next = Math.min(560, Math.max(260, window.innerWidth - ev.clientX));
      shell.style.width = `${next}px`;
      applyInset(shell);
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

function bindSplit(shell: HTMLElement, outliner: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const bounds = shell.getBoundingClientRect();
      const y = Math.min(bounds.bottom - 160, Math.max(bounds.top + 160, ev.clientY));
      outliner.style.flex = '0 0 auto';
      outliner.style.height = `${y - bounds.top}px`;
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

function chevronIcon(pointsRight: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pointsRight ? 'M6 3 L11 8 L6 13' : 'M10 3 L5 8 L10 13');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function eyeIcon(hidden: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z');
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'currentColor');
  outline.setAttribute('stroke-width', '1.2');
  svg.append(outline);
  if (hidden) {
    const slash = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    slash.setAttribute('d', 'M3 13 L13 3');
    slash.setAttribute('fill', 'none');
    slash.setAttribute('stroke', 'currentColor');
    slash.setAttribute('stroke-width', '1.2');
    svg.append(slash);
  } else {
    const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pupil.setAttribute('cx', '8');
    pupil.setAttribute('cy', '8');
    pupil.setAttribute('r', '2');
    pupil.setAttribute('fill', 'currentColor');
    svg.append(pupil);
  }
  return svg;
}

function kindLabel(kind: SceneKind): string {
  if (kind === 'background') {
    return 'Background';
  }
  if (kind === 'character') {
    return 'Character';
  }
  if (kind === 'text') {
    return 'Text';
  }
  return 'Trigger';
}

let insetWidth = -1;

/** Leaves the scene the width that is not covered by the editor. */
function applyInset(shell: HTMLElement | null): void {
  const host = document.querySelector('#app');
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const width = shell ? Math.round(shell.getBoundingClientRect().width) : 0;
  if (width === insetWidth) {
    return;
  }
  insetWidth = width;
  host.style.width = width > 0 ? `calc(100% - ${width}px)` : '';
  window.dispatchEvent(new Event('resize'));
}

function fileName(path: string | null): string {
  if (!path) {
    return '';
  }
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function formatNumber(value: number, step: number): string {
  if (step < 1) {
    return String(Math.round(value * 100) / 100);
  }
  return String(Math.round(value));
}

function blurFocus(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function currentScene(game: Game): SceneDef | null {
  const location = game.location;
  if (!location) {
    return null;
  }
  const level = game.content.level(location.levelId);
  return level ? game.content.scene(level, location.sceneId) : null;
}
