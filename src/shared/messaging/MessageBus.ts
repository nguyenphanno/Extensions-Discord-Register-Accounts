import type {
  BackgroundError,
  BackgroundRequest,
  BackgroundResponse,
  ResponsePayloadMap,
} from '../types/Messages';
import { isExtensionContextAlive } from '../../storage/StorageArea';

/**
 * UI-side transport.
 *
 * The service worker can be torn down between any two messages, so a send can
 * fail with "Could not establish connection" on a cold start. That is normal
 * MV3 behaviour, not a bug: we retry once after a short delay, which gives the
 * worker time to spin up, and only then surface the failure.
 */
const COLD_START_RETRY_MS = 220;
const COLD_START_MAX_ATTEMPTS = 3;

export async function sendToBackground<TType extends BackgroundRequest['type']>(
  request: Extract<BackgroundRequest, { type: TType }>,
): Promise<BackgroundResponse<ResponsePayloadMap[TType]>> {
  if (!isExtensionContextAlive()) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: 'The extension was reloaded. Refresh this page to reconnect.',
      },
    };
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= COLD_START_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = (await chrome.runtime.sendMessage(request)) as
        | BackgroundResponse<ResponsePayloadMap[TType]>
        | undefined;

      if (!response) {
        lastError = new Error('The background worker returned an empty response.');
      } else {
        return response;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < COLD_START_MAX_ATTEMPTS) {
      await delay(COLD_START_RETRY_MS * attempt);
    }
  }

  return {
    ok: false,
    error: {
      code: 'network',
      message: describeTransportFailure(lastError),
    },
  };
}

/** Narrow helper so call sites get `data` directly or a thrown-free error. */
export async function unwrap<T>(response: BackgroundResponse<T>): Promise<T> {
  if (response.ok) return response.data;
  throw new BackgroundTransportError(response.error);
}

export class BackgroundTransportError extends Error {
  readonly code: BackgroundError['code'];
  readonly fields: Record<string, string> | undefined;

  constructor(error: BackgroundError) {
    super(error.message);
    this.name = 'BackgroundTransportError';
    this.code = error.code;
    this.fields = error.fields;
  }
}

function describeTransportFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return 'The background worker is not responding. Try reopening the extension.';
  }
  if (/Extension context invalidated/i.test(message)) {
    return 'The extension was reloaded. Refresh this page to reconnect.';
  }

  return message || 'The background worker did not respond.';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Subscribes to background-pushed events (mailbox sync results, code found).
 * Returns an unsubscribe function so React effects stay symmetrical.
 */
export function onBackgroundEvent(handler: (event: BackgroundPushEvent) => void): () => void {
  if (!isExtensionContextAlive()) return () => undefined;

  const listener = (message: unknown): void => {
    if (typeof message === 'object' && message !== null && (message as { __push?: boolean }).__push) {
      handler(message as BackgroundPushEvent);
    }
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export type BackgroundPushEvent =
  | { __push: true; type: 'mailbox/synced'; accountId: string; mailCount: number; unreadCount: number }
  | { __push: true; type: 'mailbox/verificationCode'; accountId: string; code: string; subject: string }
  | { __push: true; type: 'activity/appended'; count: number };
