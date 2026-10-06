/**
 * Small, dependency-free helpers used across every layer.
 * Keeping them here avoids pulling a utility library into the service worker
 * bundle just for a `sleep` call.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function nowMs(): number {
  return Date.now();
}

/** Restricts a number to an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk() requires a positive size.');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Truncates and appends an ellipsis without splitting surrogate pairs. */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${[...value].slice(0, Math.max(0, maxLength - 1)).join('')}…`;
}

/**
 * FNV-1a 32-bit. Used for dedupe keys and avatar seeds - it must stay
 * deterministic across sessions and cheap enough to run thousands of times.
 */
export function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable hex digest built from `hash32`; not a cryptographic hash. */
export function digest(input: string): string {
  const primary = hash32(input);
  const secondary = hash32(`${input}#salt`);
  return `${primary.toString(16).padStart(8, '0')}${secondary.toString(16).padStart(8, '0')}`;
}

export function safeLower(value: string): string {
  return value.trim().toLowerCase();
}

/** Title-cases on spaces and hyphens while preserving inner capitals. */
export function toTitleCase(value: string): string {
  return value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Normalizes an unknown rejection reason into a printable message. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
