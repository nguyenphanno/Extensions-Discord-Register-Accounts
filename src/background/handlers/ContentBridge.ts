import { Logger } from '../../shared/logger/Logger';
import type { AutofillPayload } from '../../shared/types/Messages';
import { HandlerError } from '../HandlerError';

/** Every message the extension may send to its content script. */
export interface ContentRequest {
  __draContentScript: true;
  kind: 'apply' | 'applyCode' | 'ping' | 'flow' | 'captureToken';
  payload?: AutofillPayload;
  code?: string;
}

export interface ContentResponse {
  ok: boolean;
  filled?: number;
  matched?: string[];
  url?: string;
  error?: string;
  started?: boolean;
  token?: string;
}

/** Chrome's "no listener" error, plus the permissions and reload variants. */
const NO_RECEIVER_PATTERN =
  /Receiving end does not exist|Could not establish connection|Cannot access contents|Missing host permission|Extension context invalidated/i;

/** What the user is told when the page genuinely has nothing listening. */
const NO_RECEIVER_HINT =
  'That page has not loaded the extension yet. Reload the tab, then try again.';

/** Schemas the page cannot be asked to fill. */
const UNFILLABLE_PATTERN = /^(chrome|edge|about|devtools|view-source|chrome-extension|moz-extension):/i;

/**
 * Resolves which page a request should act on.
 *
 * The trap this exists to avoid: once the UI runs in its own window (the
 * launcher fallback), `chrome.tabs.query({ active: true, currentWindow: true })`
 * returns **the extension's own tab**, not the Discord page the user was
 * looking at. Autofill then messaged a page with no content script and failed
 * with the famously unhelpful "Receiving end does not exist".
 *
 * Browser-owned and extension-owned tabs are filtered out; among the rest, the
 * most recently used page wins.
 */
export async function requireActiveTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && isFillable(active)) return active;

  const all = await chrome.tabs.query({});
  const chosen = all
    .filter(isFillable)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];

  if (!chosen) {
    throw new HandlerError(
      'notFound',
      'No web page is open. Switch to the tab you want to fill, then try again.',
    );
  }

  return chosen;
}

/** A tab we can act on: has an id, and is not a browser or extension page. */
function isFillable(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  if (typeof tab.id !== 'number') return false;

  const url = tab.url ?? '';
  if (!url) return false;

  return !UNFILLABLE_PATTERN.test(url);
}

export function describeTab(tab: chrome.tabs.Tab): string {
  if (!tab.url) return 'the page';

  try {
    return new URL(tab.url).hostname;
  } catch {
    return 'the page';
  }
}

/**
 * Ensures the content script is live in the tab, then verifies it answers.
 *
 * `executeScript` succeeding does not guarantee a live listener - the script
 * self-guards against double injection, so a second run is a no-op - which is
 * why we probe with a real message and retry once. Failures are reported
 * precisely instead of collapsing into "could not connect", because the three
 * causes (no permission, no listener, bad page) need three different fixes.
 */
export async function ensureContentScript(tabId: number): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (error) {
      throw describeInjectionFailure(error, tabId);
    }

    const probe = await sendToTab(tabId, { __draContentScript: true, kind: 'ping' });

    if (probe.ok) return;
    if (!NO_RECEIVER_PATTERN.test(probe.error ?? '')) return;

    // Injected but silent: most likely the page navigated mid-flight.
    Logger.warn('warning', `Content script did not answer on attempt ${attempt}.`, { tabId });
  }

  throw new HandlerError('internal', NO_RECEIVER_HINT);
}

function describeInjectionFailure(error: unknown, tabId: number): HandlerError {
  const message = error instanceof Error ? error.message : String(error);

  if (/Cannot access|Missing host permission/i.test(message)) {
    return new HandlerError(
      'unsupported',
      'This extension is not allowed on that page yet. Reload the tab after installing, or grant access when Chrome asks.',
    );
  }

  if (/Extension context invalidated/i.test(message)) {
    return new HandlerError(
      'internal',
      'The extension was reloaded. Refresh this window to reconnect.',
    );
  }

  Logger.warn('warning', `Could not inject the content script into tab ${tabId}.`, {
    reason: message,
  });

  return new HandlerError('internal', `Could not reach the page: ${message}`);
}

/** Sends a message to the tab and normalises every failure mode into a result. */
export async function sendToTab(
  tabId: number,
  message: ContentRequest,
): Promise<ContentResponse> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as
      | ContentResponse
      | undefined;
    return response ?? { ok: false, error: 'The page returned no response.' };
  } catch (error) {
    const text = error instanceof Error ? error.message : 'The page is not reachable.';
    return { ok: false, error: NO_RECEIVER_PATTERN.test(text) ? NO_RECEIVER_HINT : text };
  }
}

