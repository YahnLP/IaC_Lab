/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build autonome : dist/index.html (un seul fichier, ouvrable hors-ligne), comme le simulateur réseau.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', outDir: 'dist' },
  test: { globals: true, include: ['tests/**/*.test.ts'] },
});
