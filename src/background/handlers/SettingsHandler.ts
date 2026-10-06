import { Logger } from '../../shared/logger/Logger';
import type { ExtensionSettings } from '../../shared/types/Settings';
import { ACTIVITY_LOG_LIMIT } from '../../shared/constants/AppConstants';
import { ActivityLog } from '../../storage/ActivityLog';
import { SettingsRepository } from '../../storage/SettingsRepository';
import { isValidDomain } from '../../email/EmailDomainPool';
import { ApiClient } from '../../api/ApiClient';
import { MailboxScheduler } from '../MailboxScheduler';
import { TokenHealthCheck } from '../TokenHealthCheck';
import type { BackgroundContext } from '../BackgroundContext';
import { persistRegistry } from '../BackgroundContext';
import { HandlerError } from '../HandlerError';

/** Keys the UI is allowed to patch; everything else is rejected. */
const PATCHABLE_KEYS = new Set<keyof ExtensionSettings>([
  'apiBaseUrl',
  'pinnedDomain',
  'preferredDomains',
  'refreshDomainsBeforeGenerate',
  'offlineDomainFallback',
  'displayNameFormat',
  'usernameStyle',
  'passwordLength',
  'passwordIncludeSymbols',
  'passwordAvoidAmbiguous',
  'emailLocalPartStyle',
  'emailDigitSuffixLength',
  'enforceUniqueIdentities',
  'uniquenessRetryBudget',
  'birthdayAgeMin',
  'birthdayAgeMax',
  'autoSyncMailbox',
  'mailboxSyncIntervalSeconds',
  'notifyOnVerificationCode',
  'loadRemoteMailImages',
  'tokenHealthCheckEnabled',
  'tokenHealthCheckIntervalHours',
  'maxStoredAccounts',
  'clipboardClearSeconds',
  'revealSecretsByDefault',
  'confirmDestructiveActions',
  'launcherEdge',
  'launcherCompact',
  'showPageLauncher',
  'theme',
  'reduceMotion',
  'logLevel',
]);

export async function handleSettingsGet(ctx: BackgroundContext): Promise<ExtensionSettings> {
  return ctx.getSettings();
}

/**
 * Applies a settings patch.
 *
 * The API base URL is validated harder than anything else: it is the one field
 * that decides where credentials get sent. Only `https:` origins are accepted,
 * so a typo or a malicious paste cannot silently downgrade the transport.
 */
export async function handleSettingsUpdate(
  request: { type: 'settings/update'; patch: Partial<ExtensionSettings> },
  ctx: BackgroundContext,
): Promise<ExtensionSettings> {
  const patch = request.patch ?? {};

  for (const key of Object.keys(patch)) {
    if (!PATCHABLE_KEYS.has(key as keyof ExtensionSettings)) {
      throw HandlerError.unsupported(`"${key}" cannot be changed from the UI.`);
    }
  }

  if (typeof patch.apiBaseUrl === 'string') {
    patch.apiBaseUrl = validateBaseUrl(patch.apiBaseUrl);
  }

  if (patch.pinnedDomain !== undefined && patch.pinnedDomain !== null) {
    if (!isValidDomain(patch.pinnedDomain)) {
      throw HandlerError.validation('That domain is not a valid hostname.', {
        pinnedDomain: 'Invalid domain',
      });
    }
  }

  const next = await SettingsRepository.patch(patch);
  ctx.setSettings(next);

  // The domain pool depends on several settings; keep it in sync immediately
  // rather than waiting for the next generation to notice.
  ctx.pool.setPinned(next.pinnedDomain);
  ctx.pool.setPreferred(next.preferredDomains);

  // Alarms already registered keep the old cadence, so reschedule the ones the
  // patch touched instead of waiting for a browser restart to notice.
  if ('autoSyncMailbox' in patch || 'mailboxSyncIntervalSeconds' in patch) {
    await MailboxScheduler.sync(next.mailboxSyncIntervalSeconds, next.autoSyncMailbox);
  }

  if ('tokenHealthCheckEnabled' in patch || 'tokenHealthCheckIntervalHours' in patch) {
    await TokenHealthCheck.schedule(
      next.tokenHealthCheckIntervalHours,
      next.tokenHealthCheckEnabled,
    );
  }

  return next;
}

export async function handleSettingsReset(ctx: BackgroundContext): Promise<ExtensionSettings> {
  const fresh = await SettingsRepository.reset();
  ctx.setSettings(fresh);
  ctx.pool.setPinned(fresh.pinnedDomain);
  ctx.pool.setPreferred(fresh.preferredDomains);
  await MailboxScheduler.sync(fresh.mailboxSyncIntervalSeconds, fresh.autoSyncMailbox);
  await TokenHealthCheck.schedule(
    fresh.tokenHealthCheckIntervalHours,
    fresh.tokenHealthCheckEnabled,
  );
  await persistRegistry();
  return fresh;
}

export async function handleActivityList(request: { type: 'activity/list'; limit: number }) {
  const limit = Number.isFinite(request.limit) ? Math.min(request.limit, ACTIVITY_LOG_LIMIT) : 100;
  const entries = await ActivityLog.list(limit);

  return entries.map((entry) => ({
    id: entry.id,
    at: entry.at,
    kind: entry.kind,
    severity: entry.severity,
    message: entry.message,
    ...(entry.detail ? { detail: entry.detail } : {}),
  }));
}

export async function handleActivityClear(): Promise<{ removed: number }> {
  const removed = await ActivityLog.clear();
  Logger.info('vaultCleared', `Cleared ${removed} activity entries.`, { removed });
  return { removed };
}

export async function handleActivityStats() {
  return ActivityLog.stats();
}

/** Rejects anything that is not an `https:` origin with a bare host. */
export function validateBaseUrl(raw: string): string {
  const candidate = raw.trim();
  if (!candidate) throw HandlerError.validation('A base URL is required.', { apiBaseUrl: 'Required' });

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw HandlerError.validation('That is not a valid URL.', { apiBaseUrl: 'Invalid URL' });
  }

  if (parsed.protocol !== 'https:') {
    throw HandlerError.validation('The mailbox service must be reached over HTTPS.', {
      apiBaseUrl: 'HTTPS required',
    });
  }

  if (parsed.search || parsed.hash) {
    throw HandlerError.validation('The base URL cannot contain a query string or fragment.', {
      apiBaseUrl: 'Remove query/fragment',
    });
  }

  // A pasted endpoint path such as `/domains` would double up with our own
  // paths, so we keep only the origin plus any real sub-path.
  return ApiClient.normalizeBaseUrl(`${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`);
}
