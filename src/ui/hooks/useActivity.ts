import { useCallback, useMemo } from 'react';
import type { ActivityEntry, ActivityStats } from '../../shared/types/Activity';
import { ACTIVITY_LOG_LIMIT } from '../../shared/constants/AppConstants';
import { makeBackgroundCall } from './useAsyncTask';
import { useBoundResource, type BoundResource } from './useBoundResource';

const listActivity = makeBackgroundCall((limit: number) => ({ type: 'activity/list', limit }) as const);
const clearActivity = makeBackgroundCall(() => ({ type: 'activity/clear' }) as const);
const fetchStats = makeBackgroundCall(() => ({ type: 'activity/stats' }) as const);

export interface ActivityApi extends BoundResource<ActivityEntry[]> {
  entries: ActivityEntry[];
  stats: ActivityStats;
  clear: () => Promise<number>;
  reloadStats: () => Promise<void>;
}

const EMPTY_STATS: ActivityStats = {
  total: 0,
  successes: 0,
  warnings: 0,
  errors: 0,
  lastActivityAt: null,
};

export function useActivity(limit = ACTIVITY_LOG_LIMIT): ActivityApi {
  const loader = useCallback(() => listActivity(limit), [limit]);
  const resource = useBoundResource<ActivityEntry[]>(loader);
  const statsResource = useBoundResource<ActivityStats>(fetchStats);

  const entries = useMemo(() => resource.data ?? [], [resource.data]);
  const stats = useMemo(() => statsResource.data ?? EMPTY_STATS, [statsResource.data]);

  const clear = useCallback(async () => {
    const result = await clearActivity();
    resource.mutate([]);
    statsResource.mutate(EMPTY_STATS);
    return result.removed;
  }, [resource, statsResource]);

  const reloadStats = useCallback(() => statsResource.reload(), [statsResource]);

  return {
    ...resource,
    entries,
    stats,
    clear,
    reloadStats,
  };
}
