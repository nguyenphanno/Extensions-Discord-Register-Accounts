import { defineConfig } from 'vite';
import { createSharedConfig, DIST_DIR } from './vite.shared';

/**
 * Pass 2 of 3 - the MV3 service worker.
 * Emitted as a single self-contained ES module because the manifest declares
 * `"background": { "type": "module" }`. `inlineDynamicImports` guarantees the
 * worker never tries to fetch a sibling chunk at runtime (which Chrome would
 * reject outside the service worker scope).
 */
export default defineConfig({
  ...createSharedConfig(),
  publicDir: false,
  build: {
    ...createSharedConfig().build,
    outDir: DIST_DIR,
    emptyOutDir: false,
    lib: {
      entry: 'src/background/BackgroundEntry.ts',
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
