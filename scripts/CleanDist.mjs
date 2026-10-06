// @ts-check
/** Removes build artifacts. */
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const target of ['dist', 'dist-release']) {
  rmSync(join(ROOT, target), { recursive: true, force: true });
  console.log(`[clean] removed ${target}/`);
}
