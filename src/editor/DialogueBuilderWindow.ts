/**
 * Dialogue builder over the game view. The dev editor opens and closes it.
 * The builder stays in its own page so its styles do not restyle the game.
 */
export function createDialogueBuilderWindow(): DialogueBuilderWindow {
  const frame = document.createElement('section');
  frame.className = 'builder-window';
  frame.hidden = true;

  const bar = document.createElement('header');
  bar.className = 'builder-window-bar';
  const title = document.createElement('span');
  title.textContent = 'Dialogue Builder';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'editor-hide';
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close dialogue builder');
  close.textContent = '×';
  bar.append(title, close);

  const view = document.createElement('iframe');
  view.className = 'builder-window-view';
  view.title = 'Dialogue Builder';

  const resize = document.createElement('div');
  resize.className = 'builder-window-resize';

  frame.append(bar, view, resize);
  document.body.append(frame);

  let open = false;
  let placed = false;

  const place = () => {
    const bounds = sceneBounds();
    const margin = 16;
    frame.style.left = `${bounds.left + margin}px`;
    frame.style.top = `${bounds.top + margin}px`;
    frame.style.width = `${Math.max(480, bounds.width - margin * 2)}px`;
    frame.style.height = `${Math.max(320, bounds.height - margin * 2)}px`;
  };

  const clamp = () => {
    const bounds = sceneBounds();
    const rect = frame.getBoundingClientRect();
    const width = Math.min(rect.width, bounds.width);
    const height = Math.min(rect.height, bounds.height);
    const left = Math.min(Math.max(rect.left, bounds.left), bounds.right - width);
    const top = Math.min(Math.max(rect.top, bounds.top), bounds.bottom - height);
    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
  };

  close.addEventListener('click', () => {
    api.close();
  });

  bindDrag(bar, frame, clamp);
  bindResize(resize, frame, clamp);
  window.addEventListener('resize', () => {
    if (open) {
      clamp();
    }
  });

  const api: DialogueBuilderWindow = {
    isOpen: () => open,
    open: () => {
      if (!placed) {
        place();
        placed = true;
      }
      if (!view.src) {
        view.src = new URL('builder.html?embed=1', window.location.href).href;
      }
      frame.hidden = false;
      open = true;
      clamp();
    },
    close: () => {
      frame.hidden = true;
      open = false;
    },
    toggle: () => {
      if (open) {
        api.close();
      } else {
        api.open();
      }
    },
  };
  return api;
}

export interface DialogueBuilderWindow {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

function sceneBounds(): DOMRect {
  const host = document.querySelector('#app');
  if (host instanceof HTMLElement) {
    return host.getBoundingClientRect();
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function bindDrag(handle: HTMLElement, frame: HTMLElement, clamp: () => void): void {
  handle.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node) || !handle.contains(event.target) || event.target instanceof HTMLButtonElement) {
      return;
    }
    event.preventDefault();
    const originX = event.clientX;
    const originY = event.clientY;
    const rect = frame.getBoundingClientRect();
    const move = (next: PointerEvent) => {
      frame.style.left = `${rect.left + next.clientX - originX}px`;
      frame.style.top = `${rect.top + next.clientY - originY}px`;
    };
    const up = () => {
      clamp();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function bindResize(handle: HTMLElement, frame: HTMLElement, clamp: () => void): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originY = event.clientY;
    const rect = frame.getBoundingClientRect();
    const move = (next: PointerEvent) => {
      frame.style.width = `${Math.max(480, rect.width + next.clientX - originX)}px`;
      frame.style.height = `${Math.max(320, rect.height + next.clientY - originY)}px`;
    };
    const up = () => {
      clamp();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
