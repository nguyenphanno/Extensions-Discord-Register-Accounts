import type { AccountRecord, MailboxOrigin } from '../shared/types/Account';
import { createAccountId } from '../shared/utils/Id';
import type { IdentityDraft } from './IdentityProfile';

export interface AssembleAccountInput {
  draft: IdentityDraft;
  email: string;
  emailPassword: string;
  mailboxOrigin: MailboxOrigin;
  notes?: string;
  tags?: string[];
}

/**
 * Merges a generated identity with a provisioned mailbox into the single
 * record the vault persists. Kept separate from the factory so mailbox
 * provisioning failures never leave a half-written account behind.
 */
export function assembleAccount(input: AssembleAccountInput, now = Date.now()): AccountRecord {
  return {
    id: createAccountId(),
    createdAt: now,
    updatedAt: now,

    status: 'mailboxReady',
    mailboxOrigin: input.mailboxOrigin,

    email: input.email,
    emailPassword: input.emailPassword,

    discordDisplayName: input.draft.discordDisplayName,
    discordUsername: input.draft.discordUsername,
    discordPassword: input.draft.discordPassword,

    birthday: input.draft.birthday,
    avatarSeed: input.draft.avatarSeed,
    locale: input.draft.locale,

    notes: input.notes ?? '',
    tags: input.tags ?? [],

    lastMailSyncAt: null,
    mailCount: 0,
    unreadCount: 0,
    lastVerificationCode: null,

    registeredAt: null,
    verifiedAt: null,

    token: null,
    tokenStatus: 'none',
    tokenCapturedAt: null,
    discordUserId: null,
    avatarUrl: null,
    avatarDecorationUrl: null,
    badges: [],
    nitroTier: 'none',
    phoneLocked: false,
    discordCreatedAt: null,
    profileFetchedAt: null,
  };
}

/** Immutable patch helper - the vault never mutates a stored record in place. */
export function patchAccount(
  account: AccountRecord,
  patch: Partial<AccountRecord>,
  now = Date.now(),
): AccountRecord {
  return { ...account, ...patch, id: account.id, createdAt: account.createdAt, updatedAt: now };
}
