import { Logger } from '../../shared/logger/Logger';
import type { AutofillPayload } from '../../shared/types/Messages';
import { AccountVault } from '../../storage/AccountVault';
import { HandlerError, requireString } from '../HandlerError';
import {
  describeTab,
  ensureContentScript,
  requireActiveTab,
  sendToTab,
} from './ContentBridge';

/** Reports whether a fillable page is reachable right now. */
export async function handleAutofillPing(): Promise<{ url: string; ready: boolean }> {
  try {
    const tab = await requireActiveTab();
    await ensureContentScript(tab.id);
    return { url: tab.url ?? '', ready: true };
  } catch {
    return { url: '', ready: false };
  }
}

/** Stops an empty or oversized payload from reaching the page at all. */
export function sanitizePayload(payload: AutofillPayload): AutofillPayload {
  return {
    displayName: requireString(payload?.displayName, 'displayName', { maxLength: 64 }),
    email: requireString(payload?.email, 'email', { maxLength: 320 }),
    password: requireString(payload?.password, 'password', { maxLength: 128 }),
    birthday: typeof payload?.birthday === 'string' ? payload.birthday.trim().slice(0, 10) : '',
    username: typeof payload?.username === 'string' ? payload.username.trim().slice(0, 64) : '',
  };
}

/**
 * Prefers the vault record as the source of truth so a stale preview in the UI
 * cannot write last-minute edits the vault never saw. Falls back to the payload
 * when no stored account matches the email being filled.
 */
export async function resolveEffectivePayload(payload: AutofillPayload): Promise<AutofillPayload> {
  const accounts = await AccountVault.list();
  const account = accounts.find((entry) => entry.email === payload.email);

  if (!account) return payload;

  return {
    displayName: account.discordDisplayName,
    email: account.email,
    password: account.discordPassword,
    birthday: account.birthday,
    username: account.discordUsername,
  };
}

/**
 * Fills the signup fields (fill-only, no submission).
 *
 * The content script is declared for Discord in the manifest, and `scripting`
 * lets us inject on demand anywhere else - but only after the user clicks. The
 * extension never gains standing access to every site they visit.
 */
export async function handleAutofillApply(
  request: { type: 'autofill/apply'; payload: AutofillPayload },
): Promise<{ filled: number; matched: string[] }> {
  const payload = sanitizePayload(request.payload);
  const effective = await resolveEffectivePayload(payload);

  const tab = await requireActiveTab();
  await ensureContentScript(tab.id);

  const response = await sendToTab(tab.id, {
    __draContentScript: true,
    kind: 'apply',
    payload: effective,
  });

  if (!response.ok) {
    throw new HandlerError('internal', response.error ?? 'The page rejected the autofill payload.');
  }

  Logger.success(
    'autofillApplied',
    `Filled ${response.filled ?? 0} field(s) on ${describeTab(tab)}.`,
    { filled: response.filled ?? 0 },
  );

  return { filled: response.filled ?? 0, matched: response.matched ?? [] };
}

/**
 * Kicks off the full Discord registration flow: pre-screens, field filling,
 * checkbox ticking, submission, then token capture.
 *
 * The content script acknowledges immediately and runs asynchronously - the
 * multi-step automation takes far longer than a message channel allows - with
 * progress surfaced in-page through the toast overlay.
 */
export async function handleAutofillFlow(
  request: { type: 'autofill/flow'; payload: AutofillPayload },
): Promise<{ started: boolean }> {
  const payload = sanitizePayload(request.payload);
  const effective = await resolveEffectivePayload(payload);

  const tab = await requireActiveTab();
  await ensureContentScript(tab.id);

  const response = await sendToTab(tab.id, {
    __draContentScript: true,
    kind: 'flow',
    payload: effective,
  });

  if (!response.ok || response.started !== true) {
    throw new HandlerError(
      'internal',
      response.error ?? 'The page did not start the registration flow.',
    );
  }

  Logger.info('autofillApplied', `Started the registration flow on ${describeTab(tab)}.`);

  return { started: true };
}

/**
 * Writes a verification code into the page's code field.
 * A separate entry point from {@link handleAutofillApply} so the code only ever
 * lands where a code belongs.
 */
export async function handleAutofillApplyCode(request: {
  type: 'autofill/applyCode';
  code: string;
}): Promise<{ filled: number; matched: string[] }> {
  const code = requireString(request.code, 'code', { minLength: 4, maxLength: 8 });

  const tab = await requireActiveTab();
  await ensureContentScript(tab.id);

  const response = await sendToTab(tab.id, {
    __draContentScript: true,
    kind: 'applyCode',
    code,
  });

  if (!response.ok) {
    throw new HandlerError('internal', response.error ?? 'The page rejected the code.');
  }

  Logger.success('autofillApplied', `Pasted a verification code into ${describeTab(tab)}.`);

  return { filled: response.filled ?? 0, matched: response.matched ?? [] };
}
