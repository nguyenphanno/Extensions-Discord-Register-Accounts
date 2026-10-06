import type { AccountRecord, AccountStatus, MailboxOrigin, TokenStatus } from '../shared/types/Account';
import { ACCOUNT_STATUS_VALUES, TOKEN_STATUS_VALUES } from '../shared/types/Account';
import { NOTES_MAX_LENGTH, TAGS_MAX_COUNT } from '../shared/constants/AppConstants';
import { isNonEmptyString, truncate } from '../shared/utils/Common';

const MAILBOX_ORIGINS: readonly MailboxOrigin[] = ['generated', 'registered', 'imported'];
const NITRO_TIERS = ['none', 'basic', 'full', 'boost'] as const;

/**
 * Validates one record arriving from untrusted input: `chrome.storage`, an
 * imported JSON file, or a message from another extension context.
 */
export function isAccountRecord(value: unknown): value is AccountRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<AccountRecord>;

  // Records that arrived from a TXT export never carried a mailbox password,
  // so that one field is only required for mailboxes this extension issued.
  const mailboxPasswordOk =
    record.mailboxOrigin === 'imported'
      ? typeof record.emailPassword === 'string'
      : isNonEmptyString(record.emailPassword);

  return (
    isNonEmptyString(record.id) &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt) &&
    isNonEmptyString(record.email) &&
    mailboxPasswordOk &&
    isNonEmptyString(record.discordDisplayName) &&
    isNonEmptyString(record.discordUsername) &&
    isNonEmptyString(record.discordPassword)
  );
}

/**
 * Normalizes optional fields before a record is written back.
 * Repairs rather than rejects: a hand-edited export should still import.
 */
export function sanitizeAccount(account: AccountRecord): AccountRecord {
  const status: AccountStatus = ACCOUNT_STATUS_VALUES.includes(account.status)
    ? account.status
    : 'mailboxReady';

  const mailboxOrigin: MailboxOrigin = MAILBOX_ORIGINS.includes(account.mailboxOrigin)
    ? account.mailboxOrigin
    : 'generated';

  // Records written before the token fields existed arrive without them, so
  // every new field is repaired rather than assumed present.
  const tokenStatus: TokenStatus = TOKEN_STATUS_VALUES.includes(account.tokenStatus)
    ? account.tokenStatus
    : 'none';

  const nitroTier = NITRO_TIERS.includes(account.nitroTier as (typeof NITRO_TIERS)[number])
    ? (account.nitroTier as (typeof NITRO_TIERS)[number])
    : 'none';

  return {
    ...account,
    status,
    mailboxOrigin,
    notes: truncate(account.notes ?? '', NOTES_MAX_LENGTH),
    tags: Array.isArray(account.tags)
      ? [...new Set(account.tags.filter(isNonEmptyString))].slice(0, TAGS_MAX_COUNT)
      : [],
    lastMailSyncAt: typeof account.lastMailSyncAt === 'number' ? account.lastMailSyncAt : null,
    mailCount: Number.isFinite(account.mailCount) ? account.mailCount : 0,
    unreadCount: Number.isFinite(account.unreadCount) ? account.unreadCount : 0,
    lastVerificationCode: account.lastVerificationCode ?? null,
    registeredAt: typeof account.registeredAt === 'number' ? account.registeredAt : null,
    verifiedAt: typeof account.verifiedAt === 'number' ? account.verifiedAt : null,
    updatedAt: Number.isFinite(account.updatedAt) ? account.updatedAt : account.createdAt,

    token: isNonEmptyString(account.token) ? account.token : null,
    tokenStatus,
    tokenCapturedAt: typeof account.tokenCapturedAt === 'number' ? account.tokenCapturedAt : null,
    discordUserId: isNonEmptyString(account.discordUserId) ? account.discordUserId : null,
    avatarUrl: isNonEmptyString(account.avatarUrl) ? account.avatarUrl : null,
    avatarDecorationUrl: isNonEmptyString(account.avatarDecorationUrl)
      ? account.avatarDecorationUrl
      : null,
    badges: Array.isArray(account.badges)
      ? [...new Set(account.badges.filter(isNonEmptyString))].slice(0, 32)
      : [],
    nitroTier,
    phoneLocked: account.phoneLocked === true,
    discordCreatedAt: typeof account.discordCreatedAt === 'number' ? account.discordCreatedAt : null,
    profileFetchedAt: typeof account.profileFetchedAt === 'number' ? account.profileFetchedAt : null,
  };
}

/** True when every field the vault treats as required is present. */
export function isCompleteIdentity(account: Partial<AccountRecord>): boolean {
  return (
    isNonEmptyString(account.email) &&
    isNonEmptyString(account.emailPassword) &&
    isNonEmptyString(account.discordDisplayName) &&
    isNonEmptyString(account.discordUsername) &&
    isNonEmptyString(account.discordPassword)
  );
}
