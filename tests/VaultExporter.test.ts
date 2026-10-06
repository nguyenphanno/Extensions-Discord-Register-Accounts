import { describe, expect, it } from 'vitest';
import type { AccountRecord } from '../src/shared/types/Account';
import {
  buildExport,
  escapeCsvCell,
  isTxtPayload,
  parseImport,
  parseTxtImport,
} from '../src/storage/VaultExporter';
import { sanitizeAccount } from '../src/storage/AccountRecordGuard';

const NOW = 1_760_000_000_000;

function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: 'acc_1',
    createdAt: NOW,
    updatedAt: NOW,
    status: 'registered',
    mailboxOrigin: 'generated',
    email: 'user@example.com',
    emailPassword: 'MailPass1!',
    discordDisplayName: 'Quiet Falcon',
    discordUsername: 'quietfalcon',
    discordPassword: 'DiscordPass1!',
    birthday: '2000-01-15',
    avatarSeed: 'seed#abc',
    locale: 'en-US',
    notes: '',
    tags: ['ready'],
    lastMailSyncAt: null,
    mailCount: 0,
    unreadCount: 0,
    lastVerificationCode: null,
    registeredAt: NOW,
    verifiedAt: null,
    token: 'mfa.token-value-for-tests',
    tokenStatus: 'live',
    tokenCapturedAt: NOW,
    discordUserId: '1234567890',
    avatarUrl: 'https://cdn.example/avatar.png',
    avatarDecorationUrl: null,
    badges: ['EarlySupporter'],
    nitroTier: 'none',
    phoneLocked: false,
    discordCreatedAt: NOW,
    profileFetchedAt: NOW,
    ...overrides,
  };
}

describe('buildExport', () => {
  it('writes a JSON bundle carrying every record', () => {
    const payload = buildExport([makeAccount()], 'json', new Date(NOW));

    expect(payload.mimeType).toBe('application/json');
    const bundle = JSON.parse(payload.content) as { accounts: AccountRecord[] };
    expect(bundle.accounts).toHaveLength(1);
    expect(bundle.accounts[0]?.email).toBe('user@example.com');
  });

  it('adds the token and profile columns to the CSV export', () => {
    const payload = buildExport([makeAccount()], 'csv', new Date(NOW));
    const [header, row] = payload.content.replace('\uFEFF', '').split('\r\n');

    expect(header).toContain('token,token_status,discord_user_id,avatar_url,badges');
    expect(row).toContain('mfa.token-value-for-tests');
    expect(row).toContain('live');
  });

  it('writes one token per line for the tokens-only export', () => {
    const payload = buildExport(
      [makeAccount(), makeAccount({ id: 'acc_2', token: 'second.token-value' })],
      'txt-tokens',
      new Date(NOW),
    );

    expect(payload.mimeType).toBe('text/plain;charset=utf-8');
    expect(payload.content.trim().split('\r\n')).toEqual([
      'mfa.token-value-for-tests',
      'second.token-value',
    ]);
  });

  it('omits records with no token from the tokens-only export', () => {
    const payload = buildExport([makeAccount({ token: null })], 'txt-tokens', new Date(NOW));

    expect(payload.content).toBe('');
  });

  it('writes every record on one delimited line for the full TXT export', () => {
    const payload = buildExport([makeAccount()], 'txt-full', new Date(NOW));
    const line = payload.content.trim();

    expect(line.split(' | ').length).toBeGreaterThanOrEqual(6);
    expect(line).toContain('user@example.com');
    expect(line).toContain('EarlySupporter');
  });
});

describe('escapeCsvCell', () => {
  it('neutralises spreadsheet formula injection', () => {
    expect(escapeCsvCell('=cmd|/c calc')).toBe("'=cmd|/c calc");
    expect(escapeCsvCell('+1')).toBe("'+1");
  });

  it('quotes cells containing a comma or quote', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('isTxtPayload', () => {
  it('separates TXT files from JSON bundles', () => {
    expect(isTxtPayload('token | email | user')).toBe(true);
    expect(isTxtPayload('{"accounts":[]}')).toBe(false);
    expect(isTxtPayload('   ')).toBe(false);
  });
});

describe('parseTxtImport', () => {
  it('round-trips a full TXT export without losing the important fields', () => {
    const exported = buildExport([makeAccount()], 'txt-full', new Date(NOW));
    const parsed = parseTxtImport(exported.content, NOW);

    expect(parsed.accounts).toHaveLength(1);
    const [account] = parsed.accounts;
    expect(account?.email).toBe('user@example.com');
    expect(account?.discordUsername).toBe('quietfalcon');
    expect(account?.discordPassword).toBe('DiscordPass1!');
    expect(account?.token).toBe('mfa.token-value-for-tests');
    expect(account?.tokenStatus).toBe('live');
    expect(account?.badges).toEqual(['EarlySupporter']);
    expect(parsed.skipped).toBe(0);
  });

  it('counts bare token lines instead of inventing records for them', () => {
    const parsed = parseTxtImport(`mfa.${'a'.repeat(60)}\nnot-a-record`, NOW);

    expect(parsed.accounts).toHaveLength(0);
    expect(parsed.tokensOnly).toBe(1);
    expect(parsed.skipped).toBe(1);
  });

  it('keeps good lines when one line is malformed', () => {
    const good = 'tok | user@example.com | handle | Pass1! | Name | 2000-01-15 | registered | live';
    const parsed = parseTxtImport(`broken | line\n${good}`, NOW);

    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it('produces records the sanitiser accepts', () => {
    const exported = buildExport([makeAccount()], 'txt-full', new Date(NOW));
    const [imported] = parseTxtImport(exported.content, NOW).accounts;

    // Imported records carry no mailbox password; the sanitiser must keep them.
    expect(imported && sanitizeAccount(imported).mailboxOrigin).toBe('imported');
  });
});

describe('parseImport', () => {
  it('reads both the wrapped bundle and a bare array', () => {
    const wrapped = buildExport([makeAccount()], 'json', new Date(NOW)).content;
    const bare = JSON.stringify([makeAccount()]);

    expect(parseImport(wrapped).accounts).toHaveLength(1);
    expect(parseImport(bare).accounts).toHaveLength(1);
  });

  it('reports records that do not match the schema', () => {
    const parsed = parseImport(JSON.stringify([{ nope: true }]));

    expect(parsed.accounts).toHaveLength(0);
    expect(parsed.skipped).toBe(1);
  });
});

