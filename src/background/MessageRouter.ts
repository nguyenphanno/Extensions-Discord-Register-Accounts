import type {
  BackgroundError,
  BackgroundRequest,
  BackgroundResponse,
} from '../shared/types/Messages';
import { ActivityLog } from '../storage/ActivityLog';
import { Logger } from '../shared/logger/Logger';
import { describeError } from '../shared/utils/Common';
import { isApiError } from '../api/ApiError';
import { ensureReady, persistRegistry, type BackgroundContext } from './BackgroundContext';
import { HandlerError } from './HandlerError';
import { handleIdentityGenerate, handleIdentityRegenerate, handleMailboxCreate } from './handlers/IdentityHandler';
import {
  handleChangePassword,
  handleDomains,
  handleInbox,
  handleRead,
} from './handlers/MailboxHandler';
import {
  handleVaultClear,
  handleVaultCaptureToken,
  handleVaultDelete,
  handleVaultExport,
  handleVaultImport,
  handleVaultList,
  handleVaultPatch,
  handleVaultSave,
  handleVaultSaveToken,
  handleVaultRevokeToken,
  handleVaultSetStatus,
} from './handlers/VaultHandler';
import {
  handleActivityClear,
  handleActivityList,
  handleActivityStats,
  handleSettingsGet,
  handleSettingsReset,
  handleSettingsUpdate,
} from './handlers/SettingsHandler';
import {
  handleAutofillApply,
  handleAutofillApplyCode,
  handleAutofillFlow,
  handleAutofillPing,
} from './handlers/AutofillHandler';
import {
  handleLauncherCaptureToken,
  handleLauncherNotifyClosed,
  handleLauncherOpenPanel,
  handleLauncherOpenPopup,
  handleLauncherPasteCode,
  handleLauncherStatus,
} from './handlers/LauncherHandler';

/** Requests the content script should never be able to trigger. */
const CONTENT_SCRIPT_FORBIDDEN = new Set<BackgroundRequest['type']>([
  'vault/clear',
  'vault/import',
  'vault/export',
  'settings/update',
  'settings/reset',
  'activity/clear',
]);

/**
 * Central dispatcher.
 *
 * Every branch returns the payload for its request type, and the `never` guard
 * in the default case means adding a request to the union fails compilation
 * until it is handled here - no silently-ignored message types.
 */
export async function routeRequest(
  request: BackgroundRequest,
  sender: chrome.runtime.MessageSender,
): Promise<BackgroundResponse<unknown>> {
  const startedAt = Date.now();
  let ctx: BackgroundContext;

  try {
    ctx = await ensureReady();
  } catch (error) {
    return fail({
      code: 'internal',
      message: `The extension failed to initialise: ${describeError(error)}`,
    });
  }

  try {
    if (isFromContentScript(sender) && CONTENT_SCRIPT_FORBIDDEN.has(request.type)) {
      return fail({ code: 'unsupported', message: 'That action is not available from a page.' });
    }

    const data = await dispatch(request, ctx, sender);

    Logger.debug('apiRequest', `${request.type} handled in ${Date.now() - startedAt}ms`, {
      type: request.type,
      ms: Date.now() - startedAt,
    });

    return { ok: true, data };
  } catch (error) {
    return fail(toBackgroundError(error, request.type));
  }
}

function dispatch(
  request: BackgroundRequest,
  ctx: BackgroundContext,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (request.type) {
    case 'settings/get':
      return handleSettingsGet(ctx);
    case 'settings/update':
      return handleSettingsUpdate(request, ctx);
    case 'settings/reset':
      return handleSettingsReset(ctx);

    case 'identity/generate':
      return handleIdentityGenerate(request, ctx);
    case 'identity/preview':
      return handleIdentityGenerate({ type: 'identity/generate', count: request.count, persist: false }, ctx);
    case 'identity/regenerate':
      return handleIdentityRegenerate(request, ctx);

    case 'vault/list':
      return handleVaultList();
    case 'vault/save':
      return handleVaultSave(request, ctx);
    case 'vault/delete':
      return handleVaultDelete(request, ctx);
    case 'vault/clear':
      return handleVaultClear(request, ctx);
    case 'vault/export':
      return handleVaultExport(request);
    case 'vault/import':
      return handleVaultImport(request, ctx);
    case 'vault/setStatus':
      return handleVaultSetStatus(request);
    case 'vault/patch':
      return handleVaultPatch(request);
    case 'vault/saveToken':
      return handleVaultSaveToken(request);
    case 'vault/captureToken':
      return handleVaultCaptureToken(request);
    case 'vault/revokeToken':
      return handleVaultRevokeToken(request);

    case 'mailbox/domains':
      return handleDomains(request, ctx);
    case 'mailbox/create':
      return handleMailboxCreate(request, ctx);
    case 'mailbox/inbox':
      return handleInbox(request, ctx);
    case 'mailbox/read':
      return handleRead(request, ctx);
    case 'mailbox/changePassword':
      return handleChangePassword(request, ctx);

    case 'activity/list':
      return handleActivityList(request);
    case 'activity/clear':
      return handleActivityClear();
    case 'activity/stats':
      return handleActivityStats();

    case 'autofill/apply':
      return handleAutofillApply(request);
    case 'autofill/flow':
      return handleAutofillFlow(request);
    case 'autofill/applyCode':
      return handleAutofillApplyCode(request);
    case 'autofill/ping':
      return handleAutofillPing();

    case 'launcher/openPanel':
      // Needs the sender to learn which tab to open, hence the extra argument.
      return handleLauncherOpenPanel(sender);
    case 'launcher/status':
      return handleLauncherStatus(ctx);
    case 'launcher/openPopup':
      return handleLauncherOpenPopup();
    case 'launcher/pasteCode':
      return handleLauncherPasteCode();
    case 'launcher/captureToken':
      return handleLauncherCaptureToken();
    case 'launcher/notifyClosed':
      return handleLauncherNotifyClosed();

    default: {
      const unreachable: never = request;
      return Promise.reject(
        HandlerError.unsupported(`Unhandled request: ${JSON.stringify(unreachable)}`),
      );
    }
  }
}

function isFromContentScript(sender: chrome.runtime.MessageSender): boolean {
  return sender.tab !== undefined;
}

function toBackgroundError(error: unknown, type: string): BackgroundError {
  if (error instanceof HandlerError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    };
  }

  if (isApiError(error)) {
    return { code: error.code, message: error.friendlyMessage };
  }

  Logger.error('apiError', `Handler "${type}" threw an unexpected error.`, error);

  return {
    code: 'internal',
    message: describeError(error) || 'An unexpected error occurred.',
  };
}

function fail(error: BackgroundError): BackgroundResponse<never> {
  return { ok: false, error };
}

/** Called on worker suspend; keeps buffered state from being lost. */
export async function flushOnSuspend(): Promise<void> {
  try {
    await persistRegistry();
    await ActivityLog.flush();
  } catch {
    // Suspend cleanup is best-effort; nothing useful can be done if it fails.
  }
}
