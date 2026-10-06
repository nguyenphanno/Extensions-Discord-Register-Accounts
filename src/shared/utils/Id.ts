import { randomHex } from './Random';

const ID_EPOCH = 1_700_000_000_000;

/**
 * Sortable, collision-resistant identifier: `<prefix>_<time36>_<random>`.
 * Time-first ordering means vault listings sort chronologically for free.
 */
export function createId(prefix: string): string {
  const time = (Date.now() - ID_EPOCH).toString(36).padStart(7, '0');
  return `${prefix}_${time}_${randomHex(10)}`;
}

export const createAccountId = (): string => createId('acc');
export const createActivityId = (): string => createId('act');

/**
 * Seed used to render a local avatar preview. Derived from the email so the
 * same account always paints the same avatar without storing image bytes.
 */
export function createAvatarSeed(source: string): string {
  return `${source}#${randomHex(6)}`;
}

/** Interprets a `<time36>` segment produced by {@link createId}. */
export function readIdTimestamp(id: string): number | null {
  const parts = id.split('_');
  if (parts.length < 3) return null;
  const parsed = Number.parseInt(parts[1] as string, 36);
  return Number.isFinite(parsed) ? parsed + ID_EPOCH : null;
}
