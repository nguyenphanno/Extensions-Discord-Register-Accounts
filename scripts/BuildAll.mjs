// @ts-check
/**
 * Orchestrates the three Vite passes in the order that keeps `dist/` coherent:
 *
 *   1. UI pages       -> owns dist/ (emptyOutDir) and emits popup/panel/options
 *   2. Background SW  -> appends dist/background.js as a self-contained ESM bundle
 *   3. Content script -> appends dist/content.js as a self-contained IIFE bundle
 *   4. CopyStatics    -> writes manifest.json + icons and asserts completeness
 *
 * Vite is driven through its Node API rather than a child process: spawning
 * `npx` on Windows resolves the wrong binary, and inlining the calls keeps a
 * single process and a single error stream.
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PASSES = [
  { label: 'UI pages', configFile: 'vite.config.ts' },
  { label: 'Background worker', configFile: 'vite.background.config.ts' },
  { label: 'Content script', configFile: 'vite.content.config.ts' },
];

async function main() {
  const startedAt = Date.now();

  // The UI pass writes outside its Vite `root`, so it cannot empty the output
  // directory itself. Clearing here keeps a stale bundle from a previous build
  // from silently shipping.
  rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });

  for (const pass of PASSES) {
    console.log(`\n=== [${pass.label}] vite build --config ${pass.configFile} ===`);
    // `root` is intentionally omitted: the UI pass sets it to `pages/` inside
    // its own config, and overriding it here would change the emitted layout.
    await build({
      configFile: resolve(ROOT, pass.configFile),
      logLevel: 'info',
    });
  }

  console.log('\n=== [Static assets] ===');
  const copied = spawnSync(process.execPath, ['scripts/CopyStatics.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (copied.status !== 0) {
    throw new Error(`CopyStatics exited with code ${copied.status ?? 'unknown'}.`);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[build] extension bundled into dist/ in ${seconds}s`);
}

main().catch((error) => {
  console.error('\n[build] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});