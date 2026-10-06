import { ApiClient } from '../api/ApiClient';
import { TempMailApi } from '../api/TempMailApi';
import { EmailDomainPool } from '../email/EmailDomainPool';
import { MailboxService } from '../email/MailboxService';
import { identityRegistry, type UniquenessRegistry } from '../identity/UniquenessRegistry';
import { Logger } from '../shared/logger/Logger';
import type { ExtensionSettings } from '../shared/types/Settings';
import { DEFAULT_SETTINGS } from '../shared/constants/StorageDefaults';
import { AccountVault } from '../storage/AccountVault';
import { activityLogSink } from '../storage/ActivityLog';
import { DomainCache } from '../storage/DomainCache';
import { IdentityRegistryStore } from '../storage/IdentityRegistryStore';
import { SettingsRepository } from '../storage/SettingsRepository';
import { SchemaMigrator } from '../storage/SchemaMigrator';

/**
 * Process-wide state for the service worker.
 *
 * MV3 workers are evicted aggressively, so boot has to be cheap and idempotent.
 * The context is built once per worker lifetime; every handler starts with
 * `await ensureReady()` and pays the cost exactly one time.
 */
export interface BackgroundContext {
  readonly pool: EmailDomainPool;
  readonly registry: UniquenessRegistry;
  readonly api: TempMailApi;
  readonly client: ApiClient;
  readonly mailbox: MailboxService;
  getSettings(): ExtensionSettings;
  setSettings(next: ExtensionSettings): void;
}

let context: BackgroundContext | null = null;
let bootPromise: Promise<BackgroundContext> | null = null;

let cachedSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

/** Idempotent bootstrap. Concurrent callers share one promise. */
export function ensureReady(): Promise<BackgroundContext> {
  if (context) return Promise.resolve(context);
  bootPromise ??= bootstrap();
  return bootPromise;
}

async function bootstrap(): Promise<BackgroundContext> {
  Logger.setSink(activityLogSink);

  await SchemaMigrator.run();
  cachedSettings = await SettingsRepository.load();
  Logger.setLevel(cachedSettings.logLevel);

  const client = new ApiClient({ baseUrl: cachedSettings.apiBaseUrl });
  client.setOnRequest((path, status) => {
    Logger.debug('apiRequest', `${path} -> ${status ?? 'no response'}`, { path, status: status ?? -1 });
  });

  const api = new TempMailApi(client);
  const pool = new EmailDomainPool();
  const mailbox = new MailboxService(api, pool, DomainCache);

  // Restore collision fingerprints from both persistence and the live vault so
  // names generated in earlier sessions are never re-issued.
  const snapshot = await IdentityRegistryStore.load();
  identityRegistry.hydrate(snapshot);
  identityRegistry.indexAccounts(await AccountVault.list());

  const counts = identityRegistry.counts;
  Logger.info('warning', 'Background worker ready.', {
    accounts: (await AccountVault.count()),
    trackedNames: counts.displayName,
    trackedEmails: counts.email,
  });

  context = {
    pool,
    registry: identityRegistry,
    api,
    client,
    mailbox,
    getSettings: () => cachedSettings,
    setSettings: (next) => {
      cachedSettings = next;
      Logger.setLevel(next.logLevel);
      client.setBaseUrl(next.apiBaseUrl);
    },
  };

  return context;
}

/** Persists the registry snapshot; called after batches and on suspend. */
export async function persistRegistry(): Promise<void> {
  if (!context) return;
  await IdentityRegistryStore.save(context.registry.serialize());
}

/** Test seam and hard-reset hook; not used in the normal request path. */
export function resetContext(): void {
  context = null;
  bootPromise = null;
  cachedSettings = { ...DEFAULT_SETTINGS };
}
