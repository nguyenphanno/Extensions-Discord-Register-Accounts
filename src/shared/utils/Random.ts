/**
 * Cryptographically seeded randomness helpers.
 *
 * Everything the generator produces flows through here so there is exactly one
 * place that decides "how random is random". Rejection sampling is used for
 * bounded integers so the distribution stays uniform (a naive `% n` would bias
 * the low tail and measurably increase collisions across large batches).
 */

const CRYPTO = globalThis.crypto;

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  CRYPTO.getRandomValues(buffer);
  return buffer[0] as number;
}

/** Uniform integer in `[0, maxExclusive)`. */
export function randomInt(maxExclusive: number): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
  if (maxExclusive === 1) return 0;

  const range = Math.floor(maxExclusive);
  const limit = Math.floor(0xffffffff / range) * range;
  let value = randomUint32();
  while (value >= limit) value = randomUint32();
  return value % range;
}

/** Uniform integer in `[min, max]`, inclusive on both ends. */
export function randomIntBetween(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + randomInt(hi - lo + 1);
}

/** Uniform float in `[0, 1)`. */
export function randomUnit(): number {
  return randomUint32() / 0x1_0000_0000;
}

/** Uniform pick. Throws on an empty list so callers never get `undefined` silently. */
export function pickOne<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickOne() called with an empty collection.');
  return items[randomInt(items.length)] as T;
}

/** Fitness-proportional pick; falls back to uniform when all weights are zero. */
export function pickWeighted<T>(entries: readonly { value: T; weight: number }[]): T {
  if (entries.length === 0) throw new Error('pickWeighted() called with an empty collection.');

  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return pickOne(entries).value;

  let cursor = randomUnit() * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.value;
  }
  return entries[entries.length - 1]!.value;
}

/** Fisher-Yates on a copy; the input array is never mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** `length` digits as a string. Leading zeros are preserved. */
export function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String(randomInt(10));
  return out;
}

const HEX_ALPHABET = '0123456789abcdef';

export function randomHex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += HEX_ALPHABET[randomInt(16)];
  return out;
}

/** Draws `count` characters from `alphabet` with replacement. */
export function randomFromAlphabet(alphabet: string, count: number): string {
  if (alphabet.length === 0) throw new Error('randomFromAlphabet() needs a non-empty alphabet.');
  let out = '';
  for (let i = 0; i < count; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}
