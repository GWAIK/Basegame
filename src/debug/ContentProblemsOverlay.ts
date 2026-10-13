/**
 * Lists content mistakes on screen during development, so whoever edited a
 * level.json sees what is wrong without opening the console.
 */
export function showContentProblems(problems: readonly string[]): void {
  if (problems.length === 0) {
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'content-problems';

  const title = document.createElement('strong');
  title.textContent = `Content problems (${problems.length})`;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => panel.remove());

  const list = document.createElement('ul');
  for (const problem of problems) {
    const item = document.createElement('li');
    item.textContent = problem;
    list.appendChild(item);
  }

  panel.append(title, close, list);
  document.body.appendChild(panel);
}
