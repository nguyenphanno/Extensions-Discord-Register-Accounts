const RELATIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** `5 May 2026` */
export function formatDate(value: number | null | undefined): string {
  if (!value) return '—';
  return DATE_FORMATTER.format(new Date(value));
}

/** `14:30` */
export function formatTime(value: number | null | undefined): string {
  if (!value) return '—';
  return TIME_FORMATTER.format(new Date(value));
}

/** `5 May 2026, 14:30` */
export function formatDateTime(value: number | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/**
 * `just now`, `4 min ago`, then an absolute date past a week.
 * Relative time is friendlier for inbox rows but becomes useless for anything
 * older than a few days, so the format switches rather than growing unbounded.
 */
export function formatRelative(value: number | null | undefined, now = Date.now()): string {
  if (!value) return '—';

  const delta = value - now;
  const absolute = Math.abs(delta);

  if (absolute < 45_000) return 'just now';
  if (absolute > RELATIVE_THRESHOLD_MS) return formatDate(value);

  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
    { unit: 'minute', ms: 60_000 },
    { unit: 'hour', ms: 3_600_000 },
    { unit: 'day', ms: 86_400_000 },
  ];

  for (const { unit, ms } of units) {
    if (absolute < ms * 60 || unit === 'day') {
      return RELATIVE_FORMATTER.format(Math.round(delta / ms), unit);
    }
  }

  return formatDate(value);
}

/** `00:42` / `03:15` countdown for the clipboard-clear timer. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${`${minutes}`.padStart(2, '0')}:${`${safe % 60}`.padStart(2, '0')}`;
}

/** ISO `YYYY-MM-DD` for a `Date`, in local time. */
export function toDateInputValue(date: Date): string {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ].join('-');
}
