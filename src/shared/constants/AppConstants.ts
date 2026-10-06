/** Immutable application-wide constants. No magic numbers live outside this file. */

export const APP_NAME = 'Discord Register Accounts';
export const APP_SHORT_NAME = 'DRA';

/** Temp-mail backend origin. Overridable from Settings for self-hosted forks. */
export const DEFAULT_API_BASE_URL = 'https://cheapluxurymail.xyz';

/** Backend documents ~10 req/s per IP with a burst of 50; we stay well under. */
export const API_RATE_LIMIT_PER_SECOND = 8;
export const API_RATE_LIMIT_BURST = 12;
export const API_REQUEST_TIMEOUT_MS = 20_000;
export const API_MAX_RETRY_ATTEMPTS = 3;
export const API_RETRY_BASE_DELAY_MS = 600;
export const API_RETRY_MAX_DELAY_MS = 8_000;

/** Fallback domains so the generator still works while offline. */
export const FALLBACK_DOMAINS: readonly string[] = [
  'cheapluxurymail.xyz',
  'cheapluxury.dpdns.org',
  'hanabi.qzz.io',
  'annnekkk.com',
  'lumiere.indevs.in',
];

export const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;

/** Password policy mirrors the backend's documented requirement. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_AMBIGUOUS_CHARS = 'O0oIl1';

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 32;
export const USERNAME_MAX_LENGTH = 32;
export const NOTES_MAX_LENGTH = 500;
export const TAGS_MAX_COUNT = 8;

/** Discord requires members to be at least 13; we default to a safer window. */
export const BIRTHDAY_AGE_FLOOR = 18;
export const BIRTHDAY_AGE_CEILING = 45;

export const BATCH_MIN_COUNT = 1;
export const BATCH_MAX_COUNT = 50;

export const ACTIVITY_LOG_LIMIT = 400;
export const MAX_STORED_ACCOUNTS_CEILING = 2_000;

export const MAILBOX_SYNC_MIN_SECONDS = 5;
export const MAILBOX_SYNC_MAX_SECONDS = 600;

export const CLIPBOARD_CLEAR_MAX_SECONDS = 300;

export const TOAST_DURATION_MS = 4_200;
export const TOAST_MAX_VISIBLE = 4;

export const COMMAND_PALETTE_HOTKEY = 'Ctrl+K';

/** Localized tags used by the vault filter chips. */
export const ACCOUNT_TAG_PRESETS: readonly string[] = [
  'primary',
  'backup',
  'warmup',
  'test',
  'archived',
];
