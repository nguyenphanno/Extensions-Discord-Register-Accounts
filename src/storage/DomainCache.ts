import type { DomainCachePort, DomainSnapshot } from '../email/MailboxService';
import { DOMAIN_CACHE_TTL_MS } from '../shared/constants/AppConstants';
import { dedupeValidDomains } from '../email/EmailDomainPool';
import { StorageArea } from './StorageArea';
import { StorageKeys } from './StorageKeys';

/**
 * Caches the `/domains` response.
 *
 * The domain list changes slowly and every generation would otherwise spend a
 * request against the rate limit just to ask the same question again.
 */
export const DomainCache = {
  async read(): Promise<DomainSnapshot | null> {
    const raw = await StorageArea.read<unknown>(StorageKeys.domainCache);
    if (typeof raw !== 'object' || raw === null) return null;

    const snapshot = raw as Partial<DomainSnapshot>;
    const domains = dedupeValidDomains(Array.isArray(snapshot.domains) ? snapshot.domains : []);
    if (domains.length === 0) return null;

    const fetchedAt = typeof snapshot.fetchedAt === 'number' ? snapshot.fetchedAt : 0;

    // Refuse absurd timestamps: a clock change or a hand-edited value would
    // otherwise keep a stale list alive forever.
    if (fetchedAt <= 0 || fetchedAt > Date.now() + 60_000) {
      return { domains, fetchedAt: 0 };
    }

    return { domains, fetchedAt };
  },

  async write(snapshot: DomainSnapshot): Promise<void> {
    const domains = dedupeValidDomains(snapshot.domains);
    if (domains.length === 0) return;

    await StorageArea.write(StorageKeys.domainCache, {
      domains,
      fetchedAt: Date.now(),
    } satisfies DomainSnapshot);
  },

  async clear(): Promise<void> {
    await StorageArea.remove(StorageKeys.domainCache);
  },

  /** Milliseconds until the cached entry is considered stale. */
  ageOf(snapshot: DomainSnapshot): number {
    return Math.max(0, Date.now() - snapshot.fetchedAt);
  },

  isFresh(snapshot: DomainSnapshot | null): boolean {
    return snapshot !== null && DomainCache.ageOf(snapshot) < DOMAIN_CACHE_TTL_MS;
  },
};

export type DomainCacheStore = DomainCachePort & typeof DomainCache;
