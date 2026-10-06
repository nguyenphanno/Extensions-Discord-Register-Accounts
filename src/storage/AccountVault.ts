import type { AccountRecord } from '../shared/types/Account';
import { Logger } from '../shared/logger/Logger';
import { normalizeSettings } from '../shared/constants/StorageDefaults';
import { isAccountRecord } from './AccountRecordGuard';
import { sanitizeAccount } from './AccountRecordGuard';
import { StorageArea } from './StorageArea';
import { StorageKeys } from './StorageKeys';

/**
 * Persistent credential store.
 *
 * Everything persists as one array under a single key. That is deliberate: a
 * single write is atomic, so a crash mid-save can never leave the vault with
 * half a record. The array stays small (hundreds of entries) and is always read
 * whole, keeping every read to one `chrome.storage` round-trip.
 */
export const AccountVault = {
  async list(): Promise<AccountRecord[]> {
    const raw = await StorageArea.read<unknown>(StorageKeys.accounts);
    if (!Array.isArray(raw)) return [];

    const valid: AccountRecord[] = [];
    let dropped = 0;

    for (const entry of raw) {
      if (isAccountRecord(entry)) valid.push(sanitizeAccount(entry));
      else dropped += 1;
    }

    if (dropped > 0) {
      Logger.warn('warning', `Skipped ${dropped} malformed vault record(s) during load.`, { dropped });
    }

    return valid.sort((a, b) => b.createdAt - a.createdAt);
  },

  async save(account: AccountRecord): Promise<AccountRecord[]> {
    const current = await this.list();
    const index = current.findIndex((entry) => entry.id === account.id);
    const sanitized = sanitizeAccount(account);

    const merged =
      index >= 0
        ? current.map((entry, i) => (i === index ? sanitized : entry))
        : [sanitized, ...current];

    const capped = await this.applyCap(merged);
    await StorageArea.write(StorageKeys.accounts, capped);

    Logger.success('accountSaved', `Saved account ${sanitized.discordDisplayName}.`, {
      total: capped.length,
    });

    return capped;
  },

  async remove(id: string): Promise<{ accounts: AccountRecord[]; removed: AccountRecord | null }> {
    const current = await this.list();
    const removed = current.find((entry) => entry.id === id) ?? null;
    const accounts = current.filter((entry) => entry.id !== id);

    await StorageArea.write(StorageKeys.accounts, accounts);
    if (removed) Logger.info('accountDeleted', `Deleted account ${removed.discordDisplayName}.`);

    return { accounts, removed };
  },

  async replaceAll(accounts: readonly AccountRecord[]): Promise<AccountRecord[]> {
    const sanitized = accounts.filter(isAccountRecord).map(sanitizeAccount);
    const capped = await this.applyCap(sanitized);
    await StorageArea.write(StorageKeys.accounts, capped);
    return capped;
  },

  async clear(): Promise<number> {
    const current = await this.list();
    await StorageArea.write(StorageKeys.accounts, [] as AccountRecord[]);
    Logger.warn('vaultCleared', `Cleared ${current.length} vault record(s).`, {
      removed: current.length,
    });
    return current.length;
  },

  async count(): Promise<number> {
    return (await this.list()).length;
  },

  /** Enforces the user's storage cap by dropping the oldest entries. */
  async applyCap(accounts: AccountRecord[]): Promise<AccountRecord[]> {
    const stored = await StorageArea.read<Record<string, unknown>>(StorageKeys.settings);
    const cap = Math.max(1, normalizeSettings(stored ?? {}).maxStoredAccounts);

    if (accounts.length <= cap) return accounts;

    const sorted = [...accounts].sort((a, b) => b.createdAt - a.createdAt);
    Logger.warn('warning', `Vault cap reached; dropped ${sorted.length - cap} oldest record(s).`, {
      cap,
    });

    return sorted.slice(0, cap);
  },
};
