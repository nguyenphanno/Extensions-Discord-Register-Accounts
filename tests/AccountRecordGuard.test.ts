import { describe, expect, it } from 'vitest';
import type { AccountRecord } from '../src/shared/types/Account';
import { isAccountRecord, isCompleteIdentity, sanitizeAccount } from '../src/storage/AccountRecordGuard';

const NOW = 1_760_000_000_000;

/** A record shaped like one written before the token fields existed. */
function legacyRecord(): AccountRecord {
  return {
    id: 'acc_legacy',
    createdAt: NOW,
    updatedAt: NOW,
    status: 'mailboxReady',
    mailboxOrigin: 'generated',
    email: 'legacy@example.com',
    emailPassword: 'MailPass1!',
    discordDisplayName: 'Old Name',
    discordUsername: 'oldname',
    discordPassword: 'DiscordPass1!',
    birthday: '1999-05-05',
    avatarSeed: 'seed#1',
    locale: 'en-US',
    notes: '',
    tags: [],
    lastMailSyncAt: null,
    mailCount: 0,
    unreadCount: 0,
    lastVerificationCode: null,
    registeredAt: null,
    verifiedAt: null,
  } as AccountRecord;
}

describe('sanitizeAccount', () => {
  it('fills in the token fields a pre-token record never had', () => {
    const sanitized = sanitizeAccount(legacyRecord());

    expect(sanitized.token).toBeNull();
    expect(sanitized.tokenStatus).toBe('none');
    expect(sanitized.tokenCapturedAt).toBeNull();
    expect(sanitized.badges).toEqual([]);
    expect(sanitized.nitroTier).toBe('none');
    expect(sanitized.phoneLocked).toBe(false);
    expect(sanitized.profileFetchedAt).toBeNull();
  });

  it('rejects an unknown token status instead of persisting it', () => {
    const sanitized = sanitizeAccount({
      ...legacyRecord(),
      token: 'a-token',
      tokenStatus: 'banana' as AccountRecord['tokenStatus'],
    });

    expect(sanitized.tokenStatus).toBe('none');
    expect(sanitized.token).toBe('a-token');
  });

  it('keeps a recognised token status and nitro tier', () => {
    const sanitized = sanitizeAccount({
      ...legacyRecord(),
      token: 'a-token',
      tokenStatus: 'phoneLocked',
      nitroTier: 'boost',
    });

    expect(sanitized.tokenStatus).toBe('phoneLocked');
    expect(sanitized.nitroTier).toBe('boost');
  });

  it('deduplicates and bounds the tag list', () => {
    const sanitized = sanitizeAccount({
      ...legacyRecord(),
      tags: ['a', 'a', 'b', '', 'c'],
    });

    expect(sanitized.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('isAccountRecord', () => {
  it('rejects a record missing its identity', () => {
    expect(isAccountRecord({ id: 'x' })).toBe(false);
  });

  it('accepts a generated record', () => {
    expect(isAccountRecord(legacyRecord())).toBe(true);
  });

  it('accepts an imported record with no mailbox password', () => {
    const imported = { ...legacyRecord(), mailboxOrigin: 'imported', emailPassword: '' };

    expect(isAccountRecord(imported)).toBe(true);
  });

  it('still rejects a generated record with no mailbox password', () => {
    const broken = { ...legacyRecord(), emailPassword: '' };

    expect(isAccountRecord(broken)).toBe(false);
  });
});

describe('isCompleteIdentity', () => {
  it('reports a record missing the Discord password as incomplete', () => {
    expect(isCompleteIdentity(legacyRecord())).toBe(true);
    expect(isCompleteIdentity({ ...legacyRecord(), discordPassword: '' })).toBe(false);
  });
});

