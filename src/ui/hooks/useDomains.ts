import { useCallback, useMemo } from 'react';
import type { ExtensionSettings } from '../../shared/types/Settings';
import { makeBackgroundCall } from './useAsyncTask';
import { useBoundResource } from './useBoundResource';
import { useToast } from './useToast';

const fetchDomains = makeBackgroundCall((force: boolean) => ({ type: 'mailbox/domains', force }) as const);

export interface DomainsApi {
  domains: string[];
  fetchedAt: number | null;
  fromCache: boolean;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * Domain catalogue for the generator and settings.
 *
 * `/domains` is rate-limited network work, so the resource loads once and every
 * other consumer shares the result rather than firing its own request.
 */
export function useDomains(enabled = true): DomainsApi {
  const toast = useToast();

  const loader = useCallback(async () => {
    const snapshot = await fetchDomains(false);
    return snapshot;
  }, []);

  const resource = useBoundResource(loader, { auto: enabled });

  const refresh = useCallback(
    async (force = false) => {
      try {
        const snapshot = await fetchDomains(force);
        resource.mutate(snapshot);
        toast.success(
          force ? 'Domain list refreshed' : 'Domains loaded',
          `${snapshot.domains.length} domain${snapshot.domains.length === 1 ? '' : 's'} available.`,
        );
      } catch (error) {
        toast.error(
          'Could not load domains',
          error instanceof Error ? error.message : 'The mailbox service did not respond.',
        );
      }
    },
    [resource, toast],
  );

  const snapshot = resource.data;

  return useMemo(
    () => ({
      domains: snapshot?.domains ?? [],
      fetchedAt: snapshot?.fetchedAt ?? null,
      fromCache: snapshot?.fromCache ?? false,
      loading: resource.loading,
      error: resource.error,
      refresh,
    }),
    [snapshot, resource.loading, resource.error, refresh],
  );
}

/** Convenience predicate reused by Settings and the generator preview. */
export function isPinnedDomain(settings: ExtensionSettings, domain: string): boolean {
  return settings.pinnedDomain === domain;
}
