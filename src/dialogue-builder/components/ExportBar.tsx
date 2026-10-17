import { useState } from 'react';
import { exportStory } from '../model/exportInk.ts';
import { useStory } from '../state/useStory.ts';

function download(path: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = path.split('/').pop() ?? 'story.ink';
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportBar() {
  const api = useStory();
  const files = exportStory(api.story);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const saveAll = () => {
    files.forEach((file, index) => {
      window.setTimeout(() => download(file.path, file.contents), index * 150);
    });
  };

  const saveToGame = async () => {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/__dialogue-builder/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string; count?: number };
      if (!response.ok || !result.ok) {
        setStatus(result.error ?? 'Save failed');
        return;
      }
      setStatus(`Saved ${result.count} file(s) to content/story/`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Cacophobia</p>
        <h1 className="text-lg text-ink">Dialogue Builder</h1>
        {status && <p className="mt-1 text-xs text-gold">{status}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!new URLSearchParams(window.location.search).has('embed') && (
          <a
            href="./"
            className="rounded border border-line px-2 py-1 text-xs text-muted hover:border-gold hover:text-ink"
          >
            Open game
          </a>
        )}
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => download(file.path, file.contents)}
            className="rounded border border-line px-2 py-1 font-mono text-xs text-muted hover:border-gold hover:text-ink"
          >
            {file.path}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveToGame()}
          className="rounded bg-gold px-3 py-1.5 text-sm text-paper disabled:opacity-50"
        >
          Save to game
        </button>
        <button
          type="button"
          onClick={saveAll}
          className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:border-gold"
        >
          Download .ink
        </button>
        <button type="button" onClick={api.loadExample} className="text-xs text-muted hover:text-ink">
          Load sample
        </button>
      </div>
    </header>
  );
}
