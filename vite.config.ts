import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs, so the build runs from any folder: itch.io, GitHub Pages, or a zip.
  base: './',
  server: {
    port: 5173,
  },
  build: {
    // Every asset stays a real file with a hashed name, so players never get a stale cached image.
    assetsInlineLimit: 0,
  },
});
