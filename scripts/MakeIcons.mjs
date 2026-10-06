// @ts-check
/**
 * Rasterizes the extension's toolbar/store icons into `public/icons`.
 *
 * Icons are NOT hand-drawn: the glyph geometry comes from the curated
 * `lucide-static` icon package, and the composition (Discord-blurple gradient
 * plate + centered glyph) is assembled programmatically with `sharp`.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

const GLYPH = 'user-round-plus';
const SIZES = [16, 32, 48, 128];

/** Candidate on-disk locations for a glyph inside `lucide-static`. */
const GLYPH_CANDIDATES = [
  join(ROOT, 'node_modules', 'lucide-static', 'icons', `${GLYPH}.svg`),
  join(ROOT, 'node_modules', 'lucide-static', 'dist', 'icons', `${GLYPH}.svg`),
  join(ROOT, 'node_modules', 'lucide-static', 'dist', 'esm', 'icons', `${GLYPH}.js`),
];

function locateGlyph() {
  for (const candidate of GLYPH_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Unable to locate the "${GLYPH}" glyph in lucide-static. Run "npm install" first.`,
  );
}

/** Pulls the drawable children out of a Lucide SVG so it can be re-hosted. */
function readGlyphMarkup(path) {
  const source = readFileSync(path, 'utf8');
  if (source.trimStart().startsWith('{') || !source.includes('<svg')) {
    throw new Error(`Expected an SVG document at ${path} but found a different format.`);
  }
  const inner = source.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
  if (!inner.trim()) throw new Error(`Glyph at ${path} contains no drawable children.`);
  return inner.trim();
}

/**
 * Builds the composed SVG for one raster size.
 * Glyph is scaled to ~60% of the canvas and stroked in `currentColor` white.
 */
function composeSvg(glyphMarkup, size) {
  const inset = size * 0.2;
  const glyphSize = size - inset * 2;
  const radius = size * 0.235;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5865F2"/>
      <stop offset="55%" stop-color="#4752C4"/>
      <stop offset="100%" stop-color="#7C5CFC"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#plate)"/>
  <g transform="translate(${inset} ${inset}) scale(${glyphSize / 24})"
     fill="none" stroke="#FFFFFF" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    ${glyphMarkup}
  </g>
</svg>`,
    'utf8',
  );
}

async function main() {
  const glyphPath = locateGlyph();
  const glyphMarkup = readGlyphMarkup(glyphPath);
  mkdirSync(OUT_DIR, { recursive: true });

  for (const size of SIZES) {
    const svg = composeSvg(glyphMarkup, size);
    const target = join(OUT_DIR, `Icon${size}.png`);
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(target);
    console.log(`[icons] Icon${size}.png  <-  ${GLYPH}.svg`);
  }

  console.log(`[icons] wrote ${SIZES.length} raster icons to public/icons`);
}

main().catch((error) => {
  console.error('[icons] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
