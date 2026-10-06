import type { ActivityEntry, ActivityKind, ActivitySeverity, ActivityStats } from '../shared/types/Activity';
import { ACTIVITY_LOG_LIMIT } from '../shared/constants/AppConstants';
import { createActivityId } from '../shared/utils/Id';
import type { LogSink } from '../shared/logger/Logger';
import { StorageArea } from './StorageArea';
import { StorageKeys } from './StorageKeys';

/**
 * Append-only audit trail.
 *
 * Writes are coalesced: a burst of generation events would otherwise trigger a
 * `chrome.storage` write per log line. A short debounce keeps the trail honest
 * while capping the write rate at a handful per second.
 */
const FLUSH_DEBOUNCE_MS = 400;

let pendingEntries: ActivityEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedEntries: ActivityEntry[] | null = null;

export const ActivityLog = {
  async list(limit = ACTIVITY_LOG_LIMIT): Promise<ActivityEntry[]> {
    const entries = await readAll();
    return entries.slice(0, Math.max(1, limit));
  },

  async append(entry: Omit<ActivityEntry, 'id' | 'at'> & { at?: number }): Promise<void> {
    const record: ActivityEntry = {
      id: createActivityId(),
      at: entry.at ?? Date.now(),
      kind: entry.kind,
      severity: entry.severity,
      message: entry.message,
      ...(entry.detail ? { detail: entry.detail } : {}),
    };

    pendingEntries.unshift(record);
    scheduleFlush();
  },

  async clear(): Promise<number> {
    const removed = await readAll();
    pendingEntries = [];
    cachedEntries = [];
    await StorageArea.write(StorageKeys.activity, [] as ActivityEntry[]);
    return removed.length;
  },

  async stats(): Promise<ActivityStats> {
    const entries = await readAll();
    return summarize(entries);
  },

  /** Forces any buffered entries to disk; called on suspend and before export. */
  async flush(): Promise<void> {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (pendingEntries.length === 0) return;

    const existing = await readAll();
    const merged = [...pendingEntries, ...existing].slice(0, ACTIVITY_LOG_LIMIT);

    pendingEntries = [];
    cachedEntries = merged;
    await StorageArea.write(StorageKeys.activity, merged);
  },
};

/** Returns the process-local copy when warm to avoid a storage round-trip. */
async function readAll(): Promise<ActivityEntry[]> {
  if (cachedEntries !== null) {
    return pendingEntries.length > 0 ? [...pendingEntries, ...cachedEntries] : cachedEntries;
  }

  const raw = await StorageArea.read<unknown>(StorageKeys.activity);
  const entries = Array.isArray(raw) ? raw.filter(isActivityEntry) : [];
  cachedEntries = entries;

  return pendingEntries.length > 0 ? [...pendingEntries, ...entries] : entries;
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void ActivityLog.flush();
  }, FLUSH_DEBOUNCE_MS);
}

function isActivityEntry(value: unknown): value is ActivityEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<ActivityEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'number' &&
    typeof entry.message === 'string' &&
    typeof entry.kind === 'string' &&
    typeof entry.severity === 'string'
  );
}

function summarize(entries: readonly ActivityEntry[]): ActivityStats {
  let successes = 0;
  let warnings = 0;
  let errors = 0;
  let lastActivityAt: number | null = null;

  for (const entry of entries) {
    if (entry.severity === 'success') successes += 1;
    else if (entry.severity === 'warning') warnings += 1;
    else if (entry.severity === 'error') errors += 1;

    if (lastActivityAt === null || entry.at > lastActivityAt) lastActivityAt = entry.at;
  }

  return { total: entries.length, successes, warnings, errors, lastActivityAt };
}

/** Adapts the activity log to the logger's sink contract. */
export const activityLogSink: LogSink = (event) => {
  void ActivityLog.append({
    kind: event.kind as ActivityKind,
    severity: event.severity as ActivitySeverity,
    message: event.message,
    ...(event.detail ? { detail: event.detail } : {}),
  });
};

/** Drops the in-memory cache; used after "Clear everything". */
export function invalidateActivityCache(): void {
  cachedEntries = null;
  pendingEntries = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
