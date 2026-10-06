import { Logger } from '../../shared/logger/Logger';
import type { LauncherOpenResult } from '../../shared/types/Messages';
import { AccountVault } from '../../storage/AccountVault';
import type { BackgroundContext } from '../BackgroundContext';
import { HandlerError } from '../HandlerError';
import {
  ensureContentScript,
  requireActiveTab,
  sendToTab,
} from './ContentBridge';

const PANEL_WINDOW = { width: 460, height: 900 };
const POPUP_WINDOW = { width: 420, height: 640 };

/** Window ids opened as launcher fallbacks — closed events restore the pill. */
const trackedWindowIds = new Set<number>();
let windowsListenerAttached = false;

function ensureWindowsListener(): void {
  if (windowsListenerAttached) return;
  windowsListenerAttached = true;

  chrome.windows.onRemoved.addListener((windowId) => {
    if (!trackedWindowIds.has(windowId)) return;
    trackedWindowIds.delete(windowId);
    void broadcastUiClosed();
  });
}

/** Notifies every Discord tab so the in-page launcher can reappear. */
export async function broadcastUiClosed(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://discord.com/*', 'https://*.discord.com/*'] });
    await Promise.all(
      tabs.map((tab) => {
        if (typeof tab.id !== 'number') return Promise.resolve();
        return chrome.tabs
          .sendMessage(tab.id, { type: 'launcher/uiClosed' })
          .catch(() => undefined);
      }),
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Opens the full UI, preferring the browser's side panel.
 *
 * `chrome.sidePanel.open()` is gated behind a user gesture, and a gesture that
 * originates in a content script does **not** survive the hop to the service
 * worker - Chrome refuses the call. That used to leave the launcher looking
 * like a dead button.
 *
 * So there is always a real fallback: when the side panel is unavailable we open
 * the same UI in a compact window instead.
 */
export async function handleLauncherOpenPanel(
  sender: chrome.runtime.MessageSender,
): Promise<LauncherOpenResult> {
  ensureWindowsListener();
  const tabId = sender.tab?.id;

  if (typeof tabId === 'number' && chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ tabId });
      Logger.info('autofillApplied', 'Side panel opened from the in-page launcher.');
      return { opened: true, mode: 'panel', reason: null };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The side panel was refused.';
      Logger.warn('warning', 'Side panel refused; falling back to a window.', { reason });
    }
  }

  return openUiWindow('panel.html', PANEL_WINDOW, 'window');
}

/** Opens the compact popup in its own window. */
export async function handleLauncherOpenPopup(): Promise<LauncherOpenResult> {
  ensureWindowsListener();
  return openUiWindow('popup.html', POPUP_WINDOW, 'popup');
}

/** Reports whether the launcher should render, and in what shape. */
export async function handleLauncherStatus(
  ctx: BackgroundContext,
): Promise<{ available: boolean; enabled: boolean; edge: 'right' | 'left'; compact: boolean }> {
  const settings = ctx.getSettings();

  return {
    available: true,
    enabled: settings.showPageLauncher,
    edge: settings.launcherEdge,
    compact: settings.launcherCompact,
  };
}

/** Pastes the newest verification code from any vault account onto the active tab. */
export async function handleLauncherPasteCode(): Promise<{ ok: boolean; message?: string }> {
  const accounts = await AccountVault.list();
  const withCode = accounts
    .filter((account) => account.lastVerificationCode)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const code = withCode[0]?.lastVerificationCode;
  if (!code) {
    return { ok: false, message: 'No verification code in the vault yet.' };
  }

  const tab = await requireActiveTab();
  await ensureContentScript(tab.id);

  const response = await sendToTab(tab.id, {
    __draContentScript: true,
    kind: 'applyCode',
    code,
  });

  if (!response.ok) {
    return { ok: false, message: response.error ?? 'Could not paste the code.' };
  }

  return { ok: true, message: `Pasted ${code}` };
}

/** Captures a Discord token from the active tab into the newest matching vault row. */
export async function handleLauncherCaptureToken(): Promise<{ ok: boolean; message?: string }> {
  const tab = await requireActiveTab();
  await ensureContentScript(tab.id);

  const response = await sendToTab(tab.id, {
    __draContentScript: true,
    kind: 'captureToken',
  });

  if (!response.ok || !response.token) {
    return { ok: false, message: response.error ?? 'No token found on this page.' };
  }

  const accounts = await AccountVault.list();
  const target =
    accounts.find((account) => !account.token && account.status !== 'draft') ??
    accounts.find((account) => !account.token) ??
    accounts[0];

  if (!target) {
    throw HandlerError.notFound('No vault account to attach the token to.');
  }

  const { handleVaultSaveToken } = await import('./VaultHandler');
  await handleVaultSaveToken({
    type: 'vault/saveToken',
    id: target.id,
    token: response.token,
  });

  return { ok: true, message: `Saved to ${target.discordUsername || target.email}` };
}

/** Called from panel/popup when the surface is closing or hidden. */
export async function handleLauncherNotifyClosed(): Promise<{ notified: boolean }> {
  await broadcastUiClosed();
  return { notified: true };
}

async function openUiWindow(
  page: string,
  size: { width: number; height: number },
  mode: 'window' | 'popup',
): Promise<LauncherOpenResult> {
  try {
    const bounds = await getWorkArea();
    const width = Math.min(size.width, bounds.width);
    const height = Math.min(size.height, bounds.height);

    const created = await chrome.windows.create({
      url: chrome.runtime.getURL(page),
      type: 'popup',
      width,
      height,
      left: Math.max(bounds.left, bounds.left + bounds.width - width),
      top: bounds.top,
      focused: true,
    });

    if (created && typeof created.id === 'number') {
      trackedWindowIds.add(created.id);
    }

    return { opened: true, mode, reason: null };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'The extension window could not be opened.';

    Logger.error('warning', 'Launcher window failed.', error);
    return { opened: false, mode: null, reason };
  }
}

async function getWorkArea(): Promise<{
  left: number;
  top: number;
  width: number;
  height: number;
}> {
  try {
    const current = await chrome.windows.getCurrent();

    if (current && typeof current.left === 'number' && typeof current.top === 'number') {
      return {
        left: current.left,
        top: current.top,
        width: current.width ?? 1280,
        height: current.height ?? 800,
      };
    }
  } catch {
    // Falls through to the default below.
  }

  return { left: 0, top: 0, width: 1280, height: 800 };
}
