export interface DebugActions {
  onStartDialogue: () => void;
  onShake: () => void;
  onResetCamera: () => void;
}

export function bindDebugPanel(actions: DebugActions): void {
  bindButton('debug-dialogue', actions.onStartDialogue);
  bindButton('debug-shake', actions.onShake);
  bindButton('debug-reset', actions.onResetCamera);
}

function bindButton(id: string, action: () => void): void {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing debug button: #${id}`);
  }

  element.addEventListener('click', () => {
    element.blur();
    action();
  });
}
