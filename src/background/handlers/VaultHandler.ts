import { Logger } from '../../shared/logger/Logger';
import type {
  ExportFormat,
  VaultClearScope,
  VaultPatch,
} from '../../shared/types/Messages';
import { MAX_STORED_ACCOUNTS_CEILING } from '../../shared/constants/AppConstants';
import { ActivityLog, invalidateActivityCache } from '../../storage/ActivityLog';
import { AccountVault } from '../../storage/AccountVault';
import { buildExport, isTxtPayload, parseImport, parseTxtImport, type ExportPayload } from '../../storage/VaultExporter';
import { IdentityRegistryStore } from '../../storage/IdentityRegistryStore';
import { SettingsRepository } from '../../storage/SettingsRepository';
import { StorageArea } from '../../storage/StorageArea';
import { ALL_STORAGE_KEYS } from '../../storage/StorageKeys';
import type { AccountRecord, AccountStatus, TokenStatus } from '../../shared/types/Account';
import type { BackgroundContext } from '../BackgroundContext';
import { persistRegistry, resetContext } from '../BackgroundContext';
import { HandlerError, requireString } from '../HandlerError';
import { fetchDiscordProfile, ProfileError } from '../DiscordProfileService';
import { ensureContentScript, requireActiveTab, sendToTab } from './ContentBridge';

export async function handleVaultList(): Promise<AccountRecord[]> {
  return AccountVault.list();
}

export async function handleVaultSave(
  request: { type: 'vault/save'; account: AccountRecord },
  ctx: BackgroundContext,
): Promise<AccountRecord> {
  if (!request.account || typeof request.account !== 'object') {
    throw HandlerError.validation('An account payload is required.');
  }

  const accounts = await AccountVault.save(request.account);

  // Register the names so a later generation cannot re-issue them.
  ctx.registry.indexAccount(request.account);
  await persistRegistry();

  return accounts.find((entry) => entry.id === request.account.id) ?? request.account;
}

export async function handleVaultDelete(
  request: { type: 'vault/delete'; id: string },
  ctx: BackgroundContext,
): Promise<{ id: string }> {
  const id = requireString(request.id, 'id', { maxLength: 128 });

  const { removed } = await AccountVault.remove(id);
  if (!removed) throw HandlerError.notFound('That account is no longer in the vault.');

  // Free the fingerprints so the names can be reused deliberately.
  ctx.registry.forgetAccount(removed);
  await persistRegistry();

  return { id };
}

/** Scoped destructive action, so "clear" never wipes more than the user asked. */
export async function handleVaultClear(
  request: { type: 'vault/clear'; scope: VaultClearScope },
  ctx: BackgroundContext,
): Promise<{ scope: VaultClearScope; removed: number }> {
  switch (request.scope) {
    case 'accounts': {
      const removed = await AccountVault.clear();
      ctx.registry.clear();
      await IdentityRegistryStore.clear();
      return { scope: 'accounts', removed };
    }

    case 'activity': {
      const removed = await ActivityLog.clear();
      invalidateActivityCache();
      return { scope: 'activity', removed };
    }

    case 'settings': {
      const fresh = await SettingsRepository.reset();
      ctx.setSettings(fresh);
      return { scope: 'settings', removed: 1 };
    }

    case 'everything': {
      const accounts = await AccountVault.count();
      await StorageArea.removeMany(ALL_STORAGE_KEYS);
      invalidateActivityCache();
      resetContext();
      Logger.warn('vaultCleared', 'All extension data cleared.', { accounts });
      return { scope: 'everything', removed: accounts };
    }

    default: {
      const unreachable: never = request.scope;
      throw HandlerError.unsupported(`Unknown clear scope: ${String(unreachable)}`);
    }
  }
}

/**
 * Moves an account to a new lifecycle stage.
 *
 * The milestone timestamps are stamped here rather than in the UI so the record
 * is accurate no matter which surface made the change. Moving *backwards*
 * clears the later timestamps, so "registered then failed" never leaves a stale
 * `verifiedAt` lying around.
 */
export async function handleVaultSetStatus(
  request: { type: 'vault/setStatus'; id: string; status: AccountStatus },
): Promise<AccountRecord> {
  const id = requireString(request.id, 'id', { maxLength: 128 });
  const accounts = await AccountVault.list();
  const account = accounts.find((entry) => entry.id === id);

  if (!account) throw HandlerError.notFound('That account is no longer in the vault.');

  const now = Date.now();
  const updated: AccountRecord = {
    ...account,
    status: request.status,
    registeredAt: request.status === 'registered' || request.status === 'verified'
      ? (account.registeredAt ?? now)
      : null,
    verifiedAt: request.status === 'verified' ? (account.verifiedAt ?? now) : null,
  };

  const saved = await AccountVault.save(updated);

  Logger.info('accountSaved', `${account.discordDisplayName} marked as ${request.status}.`, {
    status: request.status,
  });

  return saved.find((entry) => entry.id === id) ?? updated;
}

/** Applies user-editable fields. Anything else in the record is ignored. */
export async function handleVaultPatch(
  request: { type: 'vault/patch'; id: string; patch: VaultPatch },
): Promise<AccountRecord> {
  const id = requireString(request.id, 'id', { maxLength: 128 });
  const accounts = await AccountVault.list();
  const account = accounts.find((entry) => entry.id === id);

  if (!account) throw HandlerError.notFound('That account is no longer in the vault.');

  const updated: AccountRecord = {
    ...account,
    ...(typeof request.patch?.notes === 'string' ? { notes: request.patch.notes } : {}),
    ...(Array.isArray(request.patch?.tags) ? { tags: request.patch.tags } : {}),
  };

  const saved = await AccountVault.save(updated);
  return saved.find((entry) => entry.id === id) ?? updated;
}

export async function handleVaultExport(
  request: { type: 'vault/export'; format: ExportFormat },
): Promise<ExportPayload> {
  const accounts = await AccountVault.list();

  if (accounts.length === 0) {
    throw new HandlerError('notFound', 'The vault is empty, so there is nothing to export.');
  }

  const VALID_FORMATS: readonly ExportFormat[] = ['json', 'csv', 'txt-tokens', 'txt-full'];
  const format: ExportFormat = VALID_FORMATS.includes(request.format) ? request.format : 'json';
  return buildExport(accounts, format);
}

export async function handleVaultImport(
  request: { type: 'vault/import'; json: string },
  ctx: BackgroundContext,
): Promise<{ imported: number; skipped: number; tokensOnly: number }> {
  const payload = requireString(request.json, 'json', { minLength: 2, maxLength: 5_000_000 });

  let parsed: { accounts: AccountRecord[]; skipped: number; tokensOnly: number };
  try {
    // The same button takes both formats, so the shape decides the parser.
    parsed = isTxtPayload(payload) ? parseTxtImport(payload) : parseImport(payload);
  } catch {
    throw HandlerError.validation('That file is not a valid export.', { json: 'Invalid file' });
  }

  if (parsed.accounts.length === 0) {
    if (parsed.tokensOnly > 0) {
      throw new HandlerError(
        'notFound',
        `That file holds ${parsed.tokensOnly} token(s) but no full records. Import the "full" TXT export to bring accounts across.`,
      );
    }

    throw new HandlerError('notFound', 'No importable accounts were found in that file.');
  }

  const existing = await AccountVault.list();
  const byEmail = new Map(existing.map((account) => [account.email.toLowerCase(), account]));

  let imported = 0;
  let skipped = parsed.skipped;

  for (const account of parsed.accounts) {
    const key = account.email.toLowerCase();
    if (byEmail.has(key)) {
      skipped += 1;
      continue;
    }
    byEmail.set(key, account);
    imported += 1;
  }

  const merged = [...byEmail.values()].slice(0, MAX_STORED_ACCOUNTS_CEILING);
  const saved = await AccountVault.replaceAll(merged);

  ctx.registry.indexAccounts(saved);
  await persistRegistry();

  Logger.success('accountSaved', `Imported ${imported} account(s) from a file.`, {
    imported,
    skipped,
  });

  return { imported, skipped, tokensOnly: parsed.tokensOnly };
}

/**
 * Persists a captured token and its fetched profile onto a vault record.
 * A rejected token is still stored (status `dead`) so the user can see what
 * happened instead of wondering whether capture ran at all.
 */
async function persistToken(account: AccountRecord, token: string): Promise<AccountRecord> {
  const now = Date.now();
  let tokenStatus: TokenStatus = 'unverified';
  let profileFetchedAt: number | null = null;

  const updated: AccountRecord = {
    ...account,
    token,
    tokenCapturedAt: now,
    status: account.status === 'draft' || account.status === 'mailboxReady' ? 'registered' : account.status,
    registeredAt: account.registeredAt ?? now,
    updatedAt: now,
  };

  try {
    const profile = await fetchDiscordProfile(token);
    tokenStatus = profile.status;
    profileFetchedAt = now;

    updated.discordUserId = profile.userId;
    updated.avatarUrl = profile.avatarUrl;
    updated.avatarDecorationUrl = profile.avatarDecorationUrl;
    updated.badges = profile.badges;
    updated.nitroTier = profile.nitroTier;
    updated.phoneLocked = profile.phoneLocked;
    updated.discordCreatedAt = profile.createdAt;
    if (profile.verifiedEmail && updated.status === 'registered') {
      updated.status = 'verified';
      updated.verifiedAt = updated.verifiedAt ?? now;
    }
  } catch (error) {
    if (error instanceof ProfileError && error.code === 'dead') {
      tokenStatus = 'dead';
    } else {
      Logger.warn('warning', 'Discord profile fetch failed; token stored without profile data.', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  updated.tokenStatus = tokenStatus;
  updated.profileFetchedAt = profileFetchedAt;

  const saved = await AccountVault.save(updated);
  return saved.find((entry) => entry.id === account.id) ?? updated;
}

/**
 * Called by the content script right after registration with the token it
 * captured. The account is located by id first, then by email.
 */
export async function handleVaultSaveToken(
  request: { type: 'vault/saveToken'; email?: string; id?: string; token: string },
): Promise<{ saved: boolean; fetchedProfile: boolean }> {
  const token = requireString(request.token, 'token', { minLength: 20, maxLength: 4096 });

  const accounts = await AccountVault.list();
  const account =
    (request.id ? accounts.find((entry) => entry.id === request.id) : undefined) ??
    (request.email
      ? accounts.find((entry) => entry.email.toLowerCase() === request.email!.toLowerCase())
      : undefined);

  if (!account) {
    throw HandlerError.notFound('No vault account matches that email. Save the account first.');
  }

  const updated = await persistToken(account, token);
  return { saved: true, fetchedProfile: updated.profileFetchedAt !== null };
}

/**
 * Called from the UI: captures the token from the active tab's localStorage,
 * then fetches the profile behind it.
 */
export async function handleVaultCaptureToken(
  request: { type: 'vault/captureToken'; id: string },
): Promise<{ saved: boolean; fetchedProfile: boolean; token: string | null }> {
  const id = requireString(request.id, 'id', { maxLength: 128 });

  const accounts = await AccountVault.list();
  const account = accounts.find((entry) => entry.id === id);
  if (!account) throw HandlerError.notFound('That account is no longer in the vault.');

  const tab = await requireActiveTab();
  await ensureContentScript(tab.id);

  const response = await sendToTab(tab.id, { __draContentScript: true, kind: 'captureToken' });

  if (!response.ok || !response.token) {
    throw new HandlerError(
      'internal',
      response.error ?? 'No Discord token found in the open tab. Log in on that tab first.',
    );
  }

  const updated = await persistToken(account, response.token);
  return { saved: true, fetchedProfile: updated.profileFetchedAt !== null, token: response.token };
}

/**
 * Forgets a stored session.
 *
 * Only local state is cleared: the extension has no business invalidating a
 * live Discord session on the user's behalf, and a remote logout that fails
 * half-way would leave the vault believing something it cannot verify. The
 * record keeps its identity, so the user can capture a fresh token later.
 */
export async function handleVaultRevokeToken(
  request: { type: 'vault/revokeToken'; id: string },
): Promise<AccountRecord> {
  const id = requireString(request.id, 'id', { maxLength: 128 });

  const accounts = await AccountVault.list();
  const account = accounts.find((entry) => entry.id === id);
  if (!account) throw HandlerError.notFound('That account is no longer in the vault.');

  const cleared: AccountRecord = {
    ...account,
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
    updatedAt: Date.now(),
  };

  const saved = await AccountVault.save(cleared);
  Logger.info('accountSaved', `Cleared the stored Discord session for ${account.email}.`);

  return saved.find((entry) => entry.id === id) ?? cleared;
}
