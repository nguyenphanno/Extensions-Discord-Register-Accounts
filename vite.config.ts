import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSharedConfig, DIST_DIR } from './vite.shared';

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Pass 1 of 3 - the extension UI surfaces.
 *
 * The build root is `pages/`, so Vite emits `popup.html`, `panel.html` and
 * `options.html` at the root of `dist/` (it mirrors the input directory
 * otherwise, producing `dist/pages/popup.html`, which nothing references).
 * `emptyOutDir` is disabled because `outDir` sits outside `root`; BuildAll.mjs
 * clears `dist/` itself before this pass runs.
 */
export default defineConfig({
  ...createSharedConfig(),
  root: resolve(ROOT, 'pages'),
  plugins: [react()],
  publicDir: false,
  build: {
    ...createSharedConfig().build,
    outDir: resolve(ROOT, DIST_DIR),
    emptyOutDir: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: resolve(ROOT, 'pages/popup.html'),
        panel: resolve(ROOT, 'pages/panel.html'),
        options: resolve(ROOT, 'pages/options.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        // All three surfaces share the app shell, so name that chunk for what it
        // is instead of letting Rollup derive a name from an arbitrary module.
        manualChunks: (moduleId) =>
          moduleId.includes('node_modules/react') ||
          moduleId.includes('node_modules/lucide-react') ||
          moduleId.includes('node_modules/zustand')
            ? 'vendor'
            : moduleId.includes('src/ui/app') || moduleId.includes('src/ui/features')
              ? 'shared'
              : undefined,
        // The stylesheet has a single entry point, so it gets a stable name
        // instead of inheriting whichever chunk name Rollup happened to pick.
        assetFileNames: (asset) =>
          asset.names?.some((name) => name.endsWith('.css'))
            ? 'assets/app.css'
            : 'assets/[name][extname]',
      },
    },
  },
});
