import { fileURLToPath } from 'node:url';
import type { AliasOptions, UserConfig } from 'vite';

const resolvePath = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url));

/**
 * Single source of truth for path aliases so every build target (UI pages,
 * background service worker, content script) resolves modules identically.
 */
export const createAliases = (): AliasOptions => [
  { find: '@Api', replacement: resolvePath('./src/api') },
  { find: '@Email', replacement: resolvePath('./src/email') },
  { find: '@Identity', replacement: resolvePath('./src/identity') },
  { find: '@Storage', replacement: resolvePath('./src/storage') },
  { find: '@Background', replacement: resolvePath('./src/background') },
  { find: '@Content', replacement: resolvePath('./src/content') },
  { find: '@Shared', replacement: resolvePath('./src/shared') },
  { find: '@Ui', replacement: resolvePath('./src/ui') },
];

/** Shared compiler options applied to all three Vite pass configurations. */
export const createSharedConfig = (): Pick<UserConfig, 'resolve' | 'define' | 'build'> => ({
  resolve: {
    alias: createAliases(),
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  build: {
    target: 'chrome114',
    cssTarget: 'chrome114',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});

export const DIST_DIR = 'dist';
