import type { AutofillPayload } from '../shared/types/Messages';
import {
  applyAutofill,
  applyVerificationCode,
  detectCodeField,
  detectSignupForm,
} from './DomAutofillEngine';
import { runRegisterFlow } from './DiscordRegisterFlow';
import { getToken } from './TokenCapture';
import { showToast } from './ToastOverlay';
import { isLauncherMounted, mountLauncher, unmountLauncher } from './PageLauncher';

/**
 * Content-script entry point.
 *
 * Chrome may inject this file twice for the same document: once declaratively
 * from the manifest and again on demand through `chrome.scripting.executeScript`.
 * Two live listeners would mean two autofill runs per click, so initialisation
 * is guarded by a flag on `globalThis`.
 */

interface ContentEnvelope {
  __draContentScript: true;
  kind: 'apply' | 'applyCode' | 'ping' | 'flow' | 'captureToken';
  payload?: AutofillPayload;
  code?: string;
}

const GUARD_KEY = '__draContentScriptActive';

type GuardedGlobal = typeof globalThis & { [GUARD_KEY]?: boolean };

const scope = globalThis as GuardedGlobal;

if (!scope[GUARD_KEY]) {
  scope[GUARD_KEY] = true;
  initialise();
}

function initialise(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isContentEnvelope(message)) return false;

    if (message.kind === 'ping') {
      sendResponse({ ok: true, url: location.href });
      return false;
    }

    // Full registration flow: respond immediately, then run asynchronously so
    // the message channel does not time out during the multi-step automation.
    if (message.kind === 'flow') {
      const flowPayload = message.payload;
      if (!flowPayload) {
        sendResponse({ ok: false, error: 'No payload was provided.' });
        return false;
      }

      sendResponse({ ok: true, started: true });
      void runRegisterFlow(flowPayload);
      return false;
    }

    // Token capture: synchronous, responds with whatever is in localStorage.
    if (message.kind === 'captureToken') {
      const token = getToken();
      sendResponse(token ? { ok: true, token } : { ok: false, error: 'No token found in localStorage.' });
      return false;
    }

    // The code arrives on a different screen, minutes later, so it gets its own
    // narrow path rather than a broad field match.
    if (message.kind === 'applyCode') {
      const code = (message.code ?? '').trim();

      if (!code) {
        sendResponse({ ok: false, filled: 0, matched: [], error: 'No code was provided.' });
        return false;
      }

      const result = applyVerificationCode(code);

      if (result.filled === 0) {
        showToast(
          'No code field found',
          detectCodeField()
            ? 'That field could not be written to.'
            : 'Open the Discord verification screen, then try again.',
          'warning',
        );
      } else {
        showToast('Code pasted', result.matched.join(' · '), 'success');
      }

      sendResponse({ ok: true, ...result, url: location.href });
      return false;
    }

    const payload = message.payload;
    if (!payload) {
      sendResponse({ ok: false, filled: 0, matched: [], error: 'No payload was provided.' });
      return false;
    }

    // Respond synchronously so the popup never waits on DOM work.
    try {
      const result = applyAutofill(payload);

      if (result.filled === 0) {
        showToast(
          'No matching fields found',
          detectSignupForm()
            ? 'The form is on a later step. Advance to the signup screen and try again.'
            : 'This page does not look like a signup form.',
          'warning',
        );
      } else {
        showToast(
          `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}`,
          result.matched.join(' · '),
          'success',
        );
      }

      sendResponse({ ok: true, filled: result.filled, matched: result.matched, url: location.href });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Autofill failed.';
      showToast('Autofill failed', message, 'warning');
      sendResponse({ ok: false, filled: 0, matched: [], error: message });
    }

    return false;
  });

  void initialiseLauncher();
}

/**
 * Mounts the floating launcher.
 *
 * The content script only runs on Discord, so simply being present is what makes
 * the launcher "just show up". The user still chooses when to act on it, which
 * is the line we do not cross.
 */
async function initialiseLauncher(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({ type: 'launcher/status' })) as
      | { ok: true; data: { available: boolean; enabled: boolean; edge: 'right' | 'left'; compact: boolean } }
      | { ok: false }
      | undefined;

    if (!response?.ok) return;

    const status = response.data;
    if (!status.available || !status.enabled) {
      unmountLauncher();
      return;
    }

    mountLauncher({ edge: status.edge, compact: status.compact });
  } catch {
    // The worker is asleep or the extension reloaded; the next navigation
    // retries automatically.
    if (isLauncherMounted()) unmountLauncher();
  }
}

function isContentEnvelope(value: unknown): value is ContentEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __draContentScript?: unknown }).__draContentScript === true
  );
}

export const contentScriptLoaded = true;
