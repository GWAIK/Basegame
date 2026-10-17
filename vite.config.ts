import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const storyRoot = path.join(root, 'content', 'story');

function dialogueBuilderSave(): Plugin {
  return {
    name: 'dialogue-builder-save',
    configureServer(server) {
      server.middlewares.use('/__dialogue-builder/save', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              files?: Array<{ path: string; contents: string }>;
            };
            const files = body.files ?? [];
            if (files.length === 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'No files' }));
              return;
            }

            for (const file of files) {
              if (!/^(story\.ink|levels\/level-\d+\.ink)$/.test(file.path)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: `Bad path: ${file.path}` }));
                return;
              }
              const target = path.join(storyRoot, file.path);
              const relative = path.relative(storyRoot, target);
              if (relative.startsWith('..') || path.isAbsolute(relative)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: `Bad path: ${file.path}` }));
                return;
              }
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, file.contents, 'utf8');
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, count: files.length }));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // Relative URLs, so the build runs from any folder: itch.io, GitHub Pages, or a zip.
  base: './',
  plugins: [react(), tailwindcss(), dialogueBuilderSave()],
  server: {
    port: 5173,
  },
  build: {
    // Every asset stays a real file with a hashed name, so players never get a stale cached image.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: path.join(root, 'index.html'),
        builder: path.join(root, 'builder.html'),
      },
    },
  },
});
