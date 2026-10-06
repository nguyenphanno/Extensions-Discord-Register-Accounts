import { defineConfig } from 'vite';
import { createSharedConfig, DIST_DIR } from './vite.shared';

/**
 * Pass 3 of 3 - the content script.
 * Chrome does not support ES modules in content scripts, so this bundle is a
 * single classic IIFE with zero import statements and zero bare specifiers.
 */
export default defineConfig({
  ...createSharedConfig(),
  publicDir: false,
  build: {
    ...createSharedConfig().build,
    outDir: DIST_DIR,
    emptyOutDir: false,
    lib: {
      entry: 'src/content/ContentEntry.ts',
      formats: ['iife'],
      name: 'DiscordRegisterAccountsContent',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
  },
});
