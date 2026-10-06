// @ts-check
/**
 * Copies manifest + generated raster icons into the freshly built `dist/`.
 * Runs last so it is never wiped by the UI build's `emptyOutDir`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const REQUIRED_BUILD_OUTPUTS = ['popup.html', 'panel.html', 'options.html', 'background.js', 'content.js'];

function assertBuildOutputs() {
  const missing = REQUIRED_BUILD_OUTPUTS.filter((file) => !existsSync(join(DIST, file)));
  if (missing.length > 0) {
    throw new Error(`Build is incomplete, missing: ${missing.join(', ')}`);
  }
}

function copyManifest() {
  const manifest = join(PUBLIC, 'manifest.json');
  if (!existsSync(manifest)) throw new Error('public/manifest.json is missing.');
  cpSync(manifest, join(DIST, 'manifest.json'));
  console.log('[statics] manifest.json -> dist/manifest.json');
}

function copyIcons() {
  const icons = join(PUBLIC, 'icons');
  if (!existsSync(icons)) {
    throw new Error('public/icons is missing. Run "npm run icons" before building.');
  }

  const pngs = readdirSync(icons).filter((name) => name.toLowerCase().endsWith('.png'));
  if (pngs.length === 0) {
    throw new Error('public/icons contains no PNG files. Run "npm run icons" before building.');
  }

  mkdirSync(join(DIST, 'icons'), { recursive: true });
  let bytes = 0;
  for (const name of pngs) {
    const from = join(icons, name);
    cpSync(from, join(DIST, 'icons', name));
    bytes += statSync(from).size;
  }
  console.log(`[statics] ${pngs.length} icons -> dist/icons (${(bytes / 1024).toFixed(1)} KB)`);
}

function main() {
  if (!existsSync(DIST)) throw new Error('dist/ does not exist. Run the Vite passes first.');
  assertBuildOutputs();
  copyManifest();
  copyIcons();
  console.log('[statics] done');
}

try {
  main();
} catch (error) {
  console.error('[statics] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
