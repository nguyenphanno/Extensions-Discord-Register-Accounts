import type {
  AccountRecord,
  AccountExportBundle,
  AccountStatus,
  TokenStatus,
} from '../shared/types/Account';
import { ACCOUNT_STATUS_VALUES, TOKEN_STATUS_VALUES } from '../shared/types/Account';
import type { ExportFormat } from '../shared/types/Messages';
import { isNonEmptyString } from '../shared/utils/Common';
import { createAccountId, createAvatarSeed, createId } from '../shared/utils/Id';
import { VAULT_SCHEMA_VERSION } from '../shared/constants/StorageDefaults';
import { isAccountRecord } from './AccountRecordGuard';

/** Columns emitted by the CSV export, in order. */
const CSV_COLUMNS: readonly { header: string; read: (account: AccountRecord) => string }[] = [
  { header: 'id', read: (a) => a.id },
  { header: 'created_at', read: (a) => new Date(a.createdAt).toISOString() },
  { header: 'status', read: (a) => a.status },
  { header: 'email', read: (a) => a.email },
  { header: 'email_password', read: (a) => a.emailPassword },
  { header: 'discord_display_name', read: (a) => a.discordDisplayName },
  { header: 'discord_username', read: (a) => a.discordUsername },
  { header: 'discord_password', read: (a) => a.discordPassword },
  { header: 'birthday', read: (a) => a.birthday },
  { header: 'locale', read: (a) => a.locale },
  { header: 'mail_count', read: (a) => String(a.mailCount) },
  { header: 'last_verification_code', read: (a) => a.lastVerificationCode ?? '' },
  { header: 'tags', read: (a) => a.tags.join('|') },
  { header: 'notes', read: (a) => a.notes },
  { header: 'token', read: (a) => a.token ?? '' },
  { header: 'token_status', read: (a) => a.tokenStatus ?? 'none' },
  { header: 'discord_user_id', read: (a) => a.discordUserId ?? '' },
  { header: 'avatar_url', read: (a) => a.avatarUrl ?? '' },
  { header: 'badges', read: (a) => (a.badges ?? []).join('|') },
  { header: 'registered_at', read: (a) => (a.registeredAt ? new Date(a.registeredAt).toISOString() : '') },
  { header: 'verified_at', read: (a) => (a.verifiedAt ? new Date(a.verifiedAt).toISOString() : '') },
];

export interface ExportPayload {
  filename: string;
  content: string;
  mimeType: string;
}

/**
 * Serializes the vault for the user to take elsewhere.
 *
 * CSV cells are prefixed with a single quote when they start with a character
 * a spreadsheet would treat as a formula (`=`, `+`, `-`, `@`). Without this,
 * an imported credential such as `=cmd|...` becomes an injection vector the
 * moment the file is opened in Excel.
 */
export function buildExport(
  accounts: readonly AccountRecord[],
  format: ExportFormat,
  stamp: Date = new Date(),
): ExportPayload {
  const suffix = formatStamp(stamp);

  if (format === 'csv') {
    return {
      filename: `dra-accounts-${suffix}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: buildCsv(accounts),
    };
  }

  if (format === 'txt-tokens') {
    const lines = accounts
      .map((account) => account.token)
      .filter((token): token is string => isNonEmptyString(token));

    return {
      filename: `dra-tokens-${suffix}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      content: lines.length > 0 ? `${lines.join('\r\n')}\r\n` : '',
    };
  }

  if (format === 'txt-full') {
    const lines = accounts.map((account) =>
      [
        account.token ?? '',
        account.email,
        account.discordUsername,
        account.discordPassword,
        account.discordDisplayName,
        account.birthday,
        account.status,
        account.tokenStatus ?? 'none',
        account.discordUserId ?? '',
        account.avatarUrl ?? '',
        (account.badges ?? []).join('|'),
      ].join(' | '),
    );

    return {
      filename: `dra-accounts-full-${suffix}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      content: lines.length > 0 ? `${lines.join('\r\n')}\r\n` : '',
    };
  }

  const bundle: AccountExportBundle = {
    schemaVersion: VAULT_SCHEMA_VERSION,
    exportedAt: stamp.toISOString(),
    generatorVersion: '1.0.0',
    accounts: [...accounts],
  };

  return {
    filename: `dra-accounts-${suffix}.json`,
    mimeType: 'application/json',
    content: JSON.stringify(bundle, null, 2),
  };
}

function buildCsv(accounts: readonly AccountRecord[]): string {
  const header = CSV_COLUMNS.map((column) => column.header).join(',');
  const rows = accounts.map((account) =>
    CSV_COLUMNS.map((column) => escapeCsvCell(column.read(account))).join(','),
  );

  // Leading BOM so Excel opens UTF-8 display names correctly.
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

/** RFC 4180 quoting plus spreadsheet formula neutralisation. */
export function escapeCsvCell(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const guarded = needsFormulaGuard ? `'${value}` : value;
  const needsQuotes = /[",\r\n]/.test(guarded);
  const quoted = guarded.replace(/"/g, '""');

  return needsQuotes ? `"${quoted}"` : quoted;
}

export interface ImportResult {
  accounts: AccountRecord[];
  skipped: number;
  /** Bare token lines: real tokens, but nothing to attach them to. */
  tokensOnly: number;
}

/**
 * Parses an exported bundle back into records.
 * Accepts both the wrapped bundle shape and a bare array, and tolerates JSON
 * that a user pasted after trimming.
 */
export function parseImport(raw: string): ImportResult {
  const trimmed = raw.trim();
  if (!trimmed) return { accounts: [], skipped: 0, tokensOnly: 0 };

  const parsed = JSON.parse(trimmed) as unknown;
  const candidates = extractCandidateArray(parsed);

  const accounts: AccountRecord[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    if (isAccountRecord(candidate)) accounts.push(candidate);
    else skipped += 1;
  }

  return { accounts, skipped, tokensOnly: 0 };
}

const TXT_DELIMITER = ' | ';
const MIN_FULL_COLUMNS = 6;

/**
 * Reads the two TXT export formats back in.
 *
 * A token-only line carries no identity, so it is reported separately instead
 * of being turned into a half-empty vault record the user would have to repair.
 * Lines that are neither shape are skipped individually, never failing the batch.
 */
export function parseTxtImport(raw: string, now: number = Date.now()): ImportResult {
  const accounts: AccountRecord[] = [];
  let skipped = 0;
  let tokensOnly = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes(TXT_DELIMITER)) {
      const columns = trimmed.split(TXT_DELIMITER).map((column) => column.trim());
      const account = accountFromTxtColumns(columns, now);
      if (account) accounts.push(account);
      else skipped += 1;
      continue;
    }

    if (looksLikeToken(trimmed)) tokensOnly += 1;
    else skipped += 1;
  }

  return { accounts, skipped, tokensOnly };
}

/** True when a payload is one of our TXT exports rather than a JSON bundle. */
export function isTxtPayload(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return !trimmed.startsWith('{') && !trimmed.startsWith('[');
}

/** Discord tokens are long, opaque and base64-ish; short lines are noise. */
function looksLikeToken(value: string): boolean {
  return value.length >= 50 && /^[A-Za-z0-9._-]+$/.test(value);
}

/** Column order must match the `txt-full` writer above. */
function accountFromTxtColumns(columns: readonly string[], now: number): AccountRecord | null {
  if (columns.length < MIN_FULL_COLUMNS) return null;

  const [token, email, username, password, displayName, birthday] = columns;
  if (!email || !username || !password) return null;

  const status = columns[6] ?? '';
  const tokenStatus = columns[7] ?? '';
  const userId = columns[8] ?? '';
  const avatarUrl = columns[9] ?? '';
  const badges = (columns[10] ?? '').split('|').filter(Boolean);
  const validBirthday = birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : '2000-01-01';

  return {
    id: createAccountId(),
    createdAt: now,
    updatedAt: now,

    status: ACCOUNT_STATUS_VALUES.includes(status as AccountStatus) ? (status as AccountStatus) : 'mailboxReady',
    // An imported mailbox password is not part of the TXT format, so the record
    // is explicitly "imported" and the guard tolerates the empty value.
    mailboxOrigin: 'imported',

    email,
    emailPassword: '',

    discordDisplayName: displayName || username,
    discordUsername: username,
    discordPassword: password,

    birthday: validBirthday,
    avatarSeed: createAvatarSeed(createId('seed')),
    locale: 'en-US',

    notes: '',
    tags: ['imported'],

    lastMailSyncAt: null,
    mailCount: 0,
    unreadCount: 0,
    lastVerificationCode: null,

    registeredAt: null,
    verifiedAt: null,

    token: token || null,
    tokenStatus: TOKEN_STATUS_VALUES.includes(tokenStatus as TokenStatus)
      ? (tokenStatus as TokenStatus)
      : token
        ? 'unverified'
        : 'none',
    tokenCapturedAt: token ? now : null,
    discordUserId: userId || null,
    avatarUrl: avatarUrl || null,
    avatarDecorationUrl: null,
    badges,
    nitroTier: 'none',
    phoneLocked: false,
    discordCreatedAt: null,
    profileFetchedAt: null,
  };
}

function extractCandidateArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;

  if (typeof parsed === 'object' && parsed !== null) {
    const bundle = parsed as Partial<AccountExportBundle>;
    if (Array.isArray(bundle.accounts)) return bundle.accounts;
  }

  return [];
}

/** `20260505-143012`, used in exported filenames. */
export function formatStamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ];
  const time = [
    `${date.getHours()}`.padStart(2, '0'),
    `${date.getMinutes()}`.padStart(2, '0'),
    `${date.getSeconds()}`.padStart(2, '0'),
  ];
  return `${parts.join('')}-${time.join('')}`;
}

/** Guarded re-export so callers do not import the helper from two places. */
export const isExportableEmail = (account: AccountRecord): boolean =>
  isNonEmptyString(account.email);
