import type { RegistrySnapshot } from '../identity/UniquenessRegistry';
import { Logger } from '../shared/logger/Logger';
import { StorageArea } from './StorageArea';
import { StorageKeys } from './StorageKeys';

const EMPTY: RegistrySnapshot = { displayName: [], username: [], email: [] };

/**
 * Persists the collision fingerprints between service-worker restarts.
 *
 * Without this, every browser restart would reset the registry and the first
 * handful of generated names in a new session could repeat names already in
 * the vault - which is exactly the duplicate the user asked us to avoid.
 */
export const IdentityRegistryStore = {
  async load(): Promise<RegistrySnapshot> {
    const raw = await StorageArea.read<unknown>(StorageKeys.identityRegistry);
    if (typeof raw !== 'object' || raw === null) return { ...EMPTY };

    const snapshot = raw as Partial<RegistrySnapshot>;

    return {
      displayName: toStringArray(snapshot.displayName),
      username: toStringArray(snapshot.username),
      email: toStringArray(snapshot.email),
    };
  },

  async save(snapshot: RegistrySnapshot): Promise<void> {
    await StorageArea.write(StorageKeys.identityRegistry, snapshot);
  },

  async clear(): Promise<void> {
    await StorageArea.remove(StorageKeys.identityRegistry);
  },

  /** Convenience wrapper that logs how much state was restored. */
  async describe(): Promise<{ displayName: number; username: number; email: number }> {
    const snapshot = await this.load();
    const counts = {
      displayName: snapshot.displayName.length,
      username: snapshot.username.length,
      email: snapshot.email.length,
    };

    Logger.debug('apiRequest', 'Identity registry hydrated.', counts);
    return counts;
  },
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
