import type { ExtensionSettings } from '../types/Settings';
import {
  ACTIVITY_LOG_LIMIT,
  API_MAX_RETRY_ATTEMPTS,
  API_RATE_LIMIT_PER_SECOND,
  BATCH_MAX_COUNT,
  BIRTHDAY_AGE_CEILING,
  BIRTHDAY_AGE_FLOOR,
  DEFAULT_API_BASE_URL,
  FALLBACK_DOMAINS,
  MAILBOX_SYNC_MIN_SECONDS,
  MAX_STORED_ACCOUNTS_CEILING,
  PASSWORD_MIN_LENGTH,
} from './AppConstants';

/** Monotonic schema version for the persisted settings blob. */
export const SETTINGS_SCHEMA_VERSION = 1;

/** Monotonic schema version for the persisted vault blob. */
export const VAULT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  pinnedDomain: null,
  preferredDomains: [],
  refreshDomainsBeforeGenerate: true,
  offlineDomainFallback: [...FALLBACK_DOMAINS],

  displayNameFormat: 'adjectiveNoun',
  usernameStyle: 'lowercaseNumberSuffix',

  passwordLength: 16,
  passwordIncludeSymbols: true,
  passwordAvoidAmbiguous: true,

  emailLocalPartStyle: 'wordPairDigits',
  emailDigitSuffixLength: 4,
  enforceUniqueIdentities: true,
  uniquenessRetryBudget: 12,

  birthdayAgeMin: BIRTHDAY_AGE_FLOOR,
  birthdayAgeMax: 24,

  autoSyncMailbox: true,
  mailboxSyncIntervalSeconds: 15,
  notifyOnVerificationCode: true,
  loadRemoteMailImages: false,

  tokenHealthCheckEnabled: true,
  tokenHealthCheckIntervalHours: 6,

  maxStoredAccounts: 250,
  clipboardClearSeconds: 45,
  revealSecretsByDefault: false,
  confirmDestructiveActions: true,

  theme: 'discordDark',
  reduceMotion: false,
  logLevel: 'info',

  showPageLauncher: true,
  launcherEdge: 'right',
  launcherCompact: false,
};

/**
 * Clamps a settings object coming from disk or from a UI patch.
 * Every bound is derived from one place so the UI sliders cannot drift
 * away from what the runtime accepts.
 */
export function normalizeSettings(input: Partial<ExtensionSettings>): ExtensionSettings {
  const merged: ExtensionSettings = { ...DEFAULT_SETTINGS, ...input };

  return {
    ...merged,
    apiBaseUrl: merged.apiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL,
    pinnedDomain: merged.pinnedDomain?.trim() ? merged.pinnedDomain.trim() : null,
    preferredDomains: dedupeStrings(merged.preferredDomains),
    offlineDomainFallback: dedupeStrings(merged.offlineDomainFallback),

    passwordLength: clampInt(merged.passwordLength, PASSWORD_MIN_LENGTH, 64),

    emailDigitSuffixLength: clampInt(merged.emailDigitSuffixLength, 2, 8),
    uniquenessRetryBudget: clampInt(merged.uniquenessRetryBudget, 1, 50),

    birthdayAgeMin: clampInt(merged.birthdayAgeMin, BIRTHDAY_AGE_FLOOR, BIRTHDAY_AGE_CEILING),
    birthdayAgeMax: clampInt(
      Math.max(merged.birthdayAgeMax, merged.birthdayAgeMin),
      BIRTHDAY_AGE_FLOOR,
      BIRTHDAY_AGE_CEILING + 20,
    ),

    mailboxSyncIntervalSeconds: clampInt(
      merged.mailboxSyncIntervalSeconds,
      MAILBOX_SYNC_MIN_SECONDS,
      600,
    ),

    tokenHealthCheckIntervalHours: clampInt(merged.tokenHealthCheckIntervalHours, 1, 168),

    maxStoredAccounts: clampInt(merged.maxStoredAccounts, 10, MAX_STORED_ACCOUNTS_CEILING),
    clipboardClearSeconds: clampInt(merged.clipboardClearSeconds, 0, 300),

    logLevel: merged.logLevel,
  };
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Bounds surfaced to the UI so sliders and the runtime never disagree. */
export const SETTINGS_BOUNDS = {
  passwordLength: { min: PASSWORD_MIN_LENGTH, max: 64, step: 1 },
  emailDigitSuffixLength: { min: 2, max: 8, step: 1 },
  uniquenessRetryBudget: { min: 1, max: 50, step: 1 },
  birthdayAgeMin: { min: BIRTHDAY_AGE_FLOOR, max: BIRTHDAY_AGE_CEILING, step: 1 },
  birthdayAgeMax: { min: BIRTHDAY_AGE_FLOOR, max: BIRTHDAY_AGE_CEILING + 20, step: 1 },
  mailboxSyncIntervalSeconds: { min: MAILBOX_SYNC_MIN_SECONDS, max: 600, step: 1 },
  tokenHealthCheckIntervalHours: { min: 1, max: 168, step: 1 },
  maxStoredAccounts: { min: 10, max: MAX_STORED_ACCOUNTS_CEILING, step: 10 },
  clipboardClearSeconds: { min: 0, max: 300, step: 5 },
  batchCount: { min: 1, max: BATCH_MAX_COUNT, step: 1 },
  rateLimitPerSecond: { min: 1, max: API_RATE_LIMIT_PER_SECOND, step: 1 },
  retryAttempts: { min: 0, max: API_MAX_RETRY_ATTEMPTS, step: 1 },
  activityLogLimit: { min: 50, max: ACTIVITY_LOG_LIMIT, step: 50 },
} as const;
