const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** `1234` -> `1.2 KB`. Byte counts, not bit rates. */
export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (!Number.isFinite(bytes ?? NaN) || (bytes ?? 0) <= 0) return '0 B';

  const value = bytes as number;
  const exponent = Math.min(UNITS.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** exponent;
  const unit = UNITS[exponent] ?? 'B';

  return `${scaled.toFixed(exponent === 0 ? 0 : decimals)} ${unit}`;
}

/** Groups thousands: `12345` -> `12,345`. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/** `45000` -> `45s`, `5400000` -> `1h 30m`. Used in settings descriptions. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return `${safe}s`;

  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m ${safe % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Trims a long hostname or email for tight UI slots. */
export function truncateMiddle(value: string, maxLength = 32): string {
  if (value.length <= maxLength) return value;

  const half = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}
