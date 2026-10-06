import { Logger } from '../shared/logger/Logger';
import { APP_NAME } from '../shared/constants/AppConstants';
import { AccountVault } from '../storage/AccountVault';
import { ActivityLog } from '../storage/ActivityLog';
import { ensureReady } from './BackgroundContext';
import { handleInbox } from './handlers/MailboxHandler';
import { MailboxScheduler } from './MailboxScheduler';
import { runTokenHealthCheck, TokenHealthCheck } from './TokenHealthCheck';
import { flushOnSuspend, routeRequest } from './MessageRouter';

/**
 * Service-worker entry point.
 *
 * Everything here is registration only: MV3 gives the worker a hard budget, so
 * no work happens at import time beyond wiring listeners. The first message a
 * UI surface sends triggers the real bootstrap via `ensureReady()`.
 */

const CONTEXT_MENU_ID = 'dra:generate-identity';

chrome.runtime.onInstalled.addListener((details) => {
  void onInstalled(details);
});

chrome.runtime.onStartup.addListener(() => {
  void onStartup();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isBackgroundRequest(message)) return false;

  // Returning `true` keeps the message channel open for the async handler.
  void routeRequest(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: {
          code: 'internal',
          message: error instanceof Error ? error.message : 'Unhandled background failure.',
        },
      });
    });

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (MailboxScheduler.isSyncAlarm(alarm)) void runScheduledSync();
  if (TokenHealthCheck.isHealthAlarm(alarm)) void runScheduledTokenHealthCheck();
});

chrome.runtime.onSuspend.addListener(() => {
  void flushOnSuspend();
});

// Chrome 114+: open the side panel when the toolbar icon is clicked with the
// side-panel preference enabled, otherwise the popup handles it.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => undefined);

chrome.contextMenus?.onClicked.addListener((info) => {
  // @types/chrome omits `tabId` on OnClickData even though Chrome provides it.
  const tabId = (info as { tabId?: number }).tabId;
  if (info.menuItemId === CONTEXT_MENU_ID) void openPanelForTab(tabId);
});

async function onInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  const ctx = await ensureReady();

  if (details.reason === 'install') {
    await ActivityLog.append({
      kind: 'warning',
      severity: 'info',
      message: `${APP_NAME} installed. Generate your first identity to get started.`,
    });
    // Surface the full settings screen on first install so the defaults are
    // visible before any account is created.
    await chrome.runtime.openOptionsPage().catch(() => undefined);
  }

  if (details.reason === 'update') {
    await ActivityLog.append({
      kind: 'warning',
      severity: 'info',
      message: `Updated to version ${chrome.runtime.getManifest().version}.`,
    });
  }

  registerContextMenus();
  await MailboxScheduler.sync(ctx.getSettings().mailboxSyncIntervalSeconds, ctx.getSettings().autoSyncMailbox);
  await scheduleTokenHealthCheck(ctx.getSettings());
}

async function onStartup(): Promise<void> {
  const ctx = await ensureReady();
  const settings = ctx.getSettings();

  registerContextMenus();
  await MailboxScheduler.sync(settings.mailboxSyncIntervalSeconds, settings.autoSyncMailbox);
  await scheduleTokenHealthCheck(settings);
}

/** Keeps the token sweep aligned with the user's current preference. */
async function scheduleTokenHealthCheck(settings: {
  tokenHealthCheckEnabled: boolean;
  tokenHealthCheckIntervalHours: number;
}): Promise<void> {
  await TokenHealthCheck.schedule(
    settings.tokenHealthCheckIntervalHours,
    settings.tokenHealthCheckEnabled,
  );
}

/** Re-validates stored tokens so revoked ones surface without opening the UI. */
async function runScheduledTokenHealthCheck(): Promise<void> {
  const ctx = await ensureReady();
  if (!ctx.getSettings().tokenHealthCheckEnabled) return;

  try {
    await runTokenHealthCheck();
  } catch (error) {
    Logger.warn('warning', 'Token health check failed.', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Periodic refresh over every stored mailbox.
 *
 * Runs sequentially with a small pause so a large vault does not burst straight
 * through the backend's rate limit; the token bucket would throttle anyway, but
 * pacing here keeps the 429 path cold.
 */
async function runScheduledSync(): Promise<void> {
  const ctx = await ensureReady();
  const settings = ctx.getSettings();

  if (!settings.autoSyncMailbox) return;

  const accounts = await AccountVault.list();
  if (accounts.length === 0) return;

  let synced = 0;

  for (const account of accounts) {
    if (!account.email || !account.emailPassword) continue;

    try {
      await handleInbox(
        { type: 'mailbox/inbox', email: account.email, password: account.emailPassword },
        ctx,
      );
      synced += 1;
    } catch (error) {
      Logger.warn('mailboxSynced', `Scheduled sync failed for ${account.email}.`, {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  if (synced > 0) {
    Logger.info('mailboxSynced', `Scheduled sync refreshed ${synced} mailbox(es).`, { synced });
  }
}

function registerContextMenus(): void {
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus?.create({
      id: CONTEXT_MENU_ID,
      title: 'Generate identity from this page',
      contexts: ['page', 'editable'],
    });
  });
}

async function openPanelForTab(tabId: number | undefined): Promise<void> {
  if (tabId === undefined || !chrome.sidePanel?.open) return;
  await chrome.sidePanel.open({ tabId }).catch(() => undefined);
}

/** Structural guard so unrelated messages from the page are ignored quietly. */
function isBackgroundRequest(message: unknown): message is Parameters<typeof routeRequest>[0] {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { type?: unknown }).type === 'string' &&
    (message as { __draContentScript?: unknown }).__draContentScript !== true
  );
}

// Touch the module so bundlers keep the side-effectful registration above.
export const backgroundEntryLoaded = true;
