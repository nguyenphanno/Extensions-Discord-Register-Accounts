/**
 * Persisted account record - the single object the vault stores.
 * Every field is a primitive so the record round-trips through
 * `chrome.storage.local` (structured-clone) without surprises.
 */
/**
 * Where an account sits in the manual registration workflow.
 *
 * The extension never advances this itself - every transition happens when the
 * user says it happened - so the status is a shared note between the user and
 * the tool rather than an automated claim.
 */
export type AccountStatus =
  | 'draft'
  | 'mailboxReady'
  | 'registered'
  | 'verified'
  | 'failed';

export const ACCOUNT_STATUS_VALUES: readonly AccountStatus[] = [
  'draft',
  'mailboxReady',
  'registered',
  'verified',
  'failed',
];

export interface AccountStatusInfo {
  value: AccountStatus;
  label: string;
  description: string;
  tone: 'default' | 'accent' | 'success' | 'warning' | 'danger';
}

/** Rendered by the vault filter row and the status picker. */
export const ACCOUNT_STATUS_INFO: readonly AccountStatusInfo[] = [
  {
    value: 'draft',
    label: 'Draft',
    description: 'Identity exists, no mailbox reserved yet.',
    tone: 'default',
  },
  {
    value: 'mailboxReady',
    label: 'Mailbox ready',
    description: 'Mailbox is live. Not submitted on Discord yet.',
    tone: 'accent',
  },
  {
    value: 'registered',
    label: 'Registered',
    description: 'You pressed Create account on Discord.',
    tone: 'warning',
  },
  {
    value: 'verified',
    label: 'Verified',
    description: 'Email confirmed and the account is usable.',
    tone: 'success',
  },
  {
    value: 'failed',
    label: 'Failed',
    description: 'Discord rejected the attempt. Regenerate the name and retry.',
    tone: 'danger',
  },
];

/** How a mailbox was obtained, used for auditing and vault filtering. */
export type MailboxOrigin = 'generated' | 'registered' | 'imported';

/** Health of a captured Discord session token. */
export type TokenStatus = 'none' | 'live' | 'unverified' | 'phoneLocked' | 'dead';

export const TOKEN_STATUS_VALUES: readonly TokenStatus[] = ['none', 'live', 'unverified', 'phoneLocked', 'dead'];

export interface TokenStatusInfo {
  value: TokenStatus;
  label: string;
  description: string;
  tone: 'default' | 'accent' | 'success' | 'warning' | 'danger';
}

/** Rendered next to the token chip in the vault. */
export const TOKEN_STATUS_INFO: readonly TokenStatusInfo[] = [
  { value: 'none', label: 'No token', description: 'Token has not been captured yet.', tone: 'default' },
  { value: 'live', label: 'Live', description: 'Token authenticated successfully.', tone: 'success' },
  { value: 'unverified', label: 'Unverified', description: 'Account exists but email is not verified.', tone: 'accent' },
  { value: 'phoneLocked', label: 'Phone locked', description: 'Token is valid but the account is phone-locked.', tone: 'warning' },
  { value: 'dead', label: 'Dead', description: 'Discord rejected the token.', tone: 'danger' },
];

export interface AccountRecord {
  /** Stable local identifier; never sent to any remote service. */
  id: string;
  createdAt: number;
  updatedAt: number;

  status: AccountStatus;
  mailboxOrigin: MailboxOrigin;

  /** Temporary mailbox credentials issued by the temp-mail backend. */
  email: string;
  emailPassword: string;

  /** Discord-side identity that the user will paste into the signup form. */
  discordDisplayName: string;
  discordUsername: string;
  discordPassword: string;

  /** `YYYY-MM-DD`, kept as a string so it survives JSON export unchanged. */
  birthday: string;
  /** Deterministic seed for the locally rendered avatar preview. */
  avatarSeed: string;
  /** BCP-47 tag, e.g. `en-US`. */
  locale: string;

  notes: string;
  tags: string[];

  /** Mailbox bookkeeping, refreshed by the background poller. */
  lastMailSyncAt: number | null;
  mailCount: number;
  unreadCount: number;
  /** Highest verification code seen in this mailbox, if any. */
  lastVerificationCode: string | null;

  /** When the user reported each milestone; null while it has not happened. */
  registeredAt: number | null;
  verifiedAt: number | null;

  /** Discord session token captured from localStorage after registration. */
  token: string | null;
  tokenStatus: TokenStatus;
  tokenCapturedAt: number | null;

  /** Profile data fetched from /api/v9/users/@me using the token. */
  discordUserId: string | null;
  avatarUrl: string | null;
  avatarDecorationUrl: string | null;
  badges: string[];
  nitroTier: 'none' | 'basic' | 'full' | 'boost';
  phoneLocked: boolean;
  /** Discord account creation date derived from the snowflake ID. */
  discordCreatedAt: number | null;
  profileFetchedAt: number | null;
}

/** Shape written to disk by the export feature. */
export interface AccountExportBundle {
  schemaVersion: number;
  exportedAt: string;
  generatorVersion: string;
  accounts: AccountRecord[];
}
