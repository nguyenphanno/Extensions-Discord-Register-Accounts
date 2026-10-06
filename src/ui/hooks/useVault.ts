import { useCallback, useMemo } from 'react';
import type { AccountRecord } from '../../shared/types/Account';
import type { ExportFormat, VaultClearScope } from '../../shared/types/Messages';
import { makeBackgroundCall } from './useAsyncTask';
import { useBoundResource, type BoundResource } from './useBoundResource';

const listVault = makeBackgroundCall(() => ({ type: 'vault/list' }) as const);
const saveAccount = makeBackgroundCall((account: AccountRecord) => ({ type: 'vault/save', account }) as const);
const deleteAccount = makeBackgroundCall((id: string) => ({ type: 'vault/delete', id }) as const);
const clearVault = makeBackgroundCall((scope: VaultClearScope) => ({ type: 'vault/clear', scope }) as const);
const exportVault = makeBackgroundCall((format: ExportFormat) => ({ type: 'vault/export', format }) as const);
const importVault = makeBackgroundCall((json: string) => ({ type: 'vault/import', json }) as const);
const captureToken = makeBackgroundCall(
  (id: string) => ({ type: 'vault/captureToken', id }) as const,
);

export interface VaultApi extends BoundResource<AccountRecord[]> {
  accounts: AccountRecord[];
  save: (account: AccountRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: (scope: VaultClearScope) => Promise<number>;
  buildExport: (format: ExportFormat) => ReturnType<typeof exportVault>;
  runImport: (json: string) => Promise<{ imported: number; skipped: number; tokensOnly: number }>;
  captureToken: (id: string) => Promise<{ saved: boolean; fetchedProfile: boolean; token: string | null }>;
  stats: {
    total: number;
    registered: number;
    withCode: number;
    withToken: number;
    verified: number;
    tokenLive: number;
    tokenLocked: number;
    tokenDead: number;
  };
}

export function useVault(): VaultApi {
  const resource = useBoundResource<AccountRecord[]>(listVault);
  const accounts = useMemo(() => resource.data ?? [], [resource.data]);

  const save = useCallback(
    async (account: AccountRecord) => {
      const saved = await saveAccount(account);
      resource.set((current) => {
        const list = current ?? [];
        const index = list.findIndex((entry) => entry.id === saved.id);
        return index >= 0
          ? list.map((entry, i) => (i === index ? saved : entry))
          : [saved, ...list];
      });
    },
    [resource],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteAccount(id);
      resource.set((current) => (current ?? []).filter((entry) => entry.id !== id));
    },
    [resource],
  );

  const clear = useCallback(
    async (scope: VaultClearScope) => {
      const result = await clearVault(scope);
      if (scope === 'accounts' || scope === 'everything') resource.mutate([]);
      return result.removed;
    },
    [resource],
  );

  const stats = useMemo(
    () => ({
      total: accounts.length,
      registered: accounts.filter((account) => account.status === 'registered').length,
      withCode: accounts.filter((account) => account.lastVerificationCode !== null).length,
      withToken: accounts.filter((account) => account.token !== null).length,
      verified: accounts.filter((account) => account.status === 'verified').length,
      tokenLive: accounts.filter((account) => account.tokenStatus === 'live').length,
      tokenLocked: accounts.filter((account) => account.tokenStatus === 'phoneLocked').length,
      tokenDead: accounts.filter((account) => account.tokenStatus === 'dead').length,
    }),
    [accounts],
  );

  return {
    ...resource,
    accounts,
    save,
    remove,
    clear,
    buildExport: exportVault,
    runImport: importVault,
    captureToken,
    stats,
  };
}
