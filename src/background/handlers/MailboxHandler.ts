import type { TempMailMessage } from '../../shared/types/Mail';
import type { DomainSnapshot } from '../../email/MailboxService';
import { Logger } from '../../shared/logger/Logger';
import { ApiError } from '../../api/ApiError';
import { findLatestVerificationCode, toMailSummaries } from '../../email/MailSummarizer';
import { satisfiesPasswordPolicy } from '../../identity/PasswordGenerator';
import { AccountVault } from '../../storage/AccountVault';
import { DomainCache } from '../../storage/DomainCache';
import type { BackgroundContext } from '../BackgroundContext';
import { HandlerError, requireString } from '../HandlerError';

/** `GET /domains` with cache control. */
export async function handleDomains(
  request: { type: 'mailbox/domains'; force: boolean },
  ctx: BackgroundContext,
): Promise<DomainSnapshot & { fromCache: boolean }> {
  const settings = ctx.getSettings();

  if (request.force) await DomainCache.clear();

  const snapshot = await ctx.mailbox.refreshDomains(settings, request.force);

  if (snapshot.domains.length === 0) {
    throw new HandlerError('network', 'No mailbox domains are available right now.');
  }

  return snapshot;
}

/** Inbox snapshot; also folds the result back into the matching vault record. */
export async function handleInbox(
  request: { type: 'mailbox/inbox'; email: string; password: string },
  ctx: BackgroundContext,
): Promise<TempMailMessage[]> {
  const email = requireString(request.email, 'email', { maxLength: 320 });
  const password = requireString(request.password, 'password', { maxLength: 128 });

  const messages = await ctx.api.getEmails(email, password);
  await syncVaultStats(email, messages);

  Logger.info('mailboxSynced', `Fetched ${messages.length} message(s) for ${email}.`, {
    count: messages.length,
  });

  return messages;
}

/** One message resolved by its `Message-ID`. */
export async function handleRead(
  request: { type: 'mailbox/read'; email: string; password: string; messageId: string },
  ctx: BackgroundContext,
): Promise<TempMailMessage> {
  const email = requireString(request.email, 'email', { maxLength: 320 });
  const password = requireString(request.password, 'password', { maxLength: 128 });

  // An empty Message-ID means "newest message", so fall back to the inbox.
  if (!request.messageId?.trim()) {
    const messages = await ctx.api.getEmails(email, password);
    const [first] = toMailSummaries(messages);
    if (!first) throw HandlerError.notFound('This mailbox has no messages yet.');

    const resolved = messages.find((message) => message.id === first.id);
    if (!resolved) throw HandlerError.notFound('Could not resolve the newest message.');
    return resolved;
  }

  const messageId = requireString(request.messageId, 'messageId', { maxLength: 512 });
  return ctx.api.viewEmail(email, password, messageId);
}

/** `POST /change_password`, mirrored into the vault so the record stays valid. */
export async function handleChangePassword(
  request: {
    type: 'mailbox/changePassword';
    email: string;
    currentPassword: string;
    newPassword: string;
  },
  ctx: BackgroundContext,
): Promise<{ email: string }> {
  const email = requireString(request.email, 'email', { maxLength: 320 });
  const currentPassword = requireString(request.currentPassword, 'currentPassword', { maxLength: 128 });
  const newPassword = requireString(request.newPassword, 'newPassword', { maxLength: 128 });

  const violation = describePasswordViolation(newPassword);
  if (violation) {
    throw HandlerError.validation(violation, { newPassword: violation });
  }

  const confirmed = await ctx.api.changePassword(email, currentPassword, newPassword);

  // The server succeeded, so the local copy must change too or the next sync
  // will fail with 401 and look like data corruption to the user.
  const accounts = await AccountVault.list();
  const match = accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());

  if (match) {
    await AccountVault.save({ ...match, emailPassword: newPassword });
  }

  Logger.success('settingsUpdated', `Rotated the mailbox password for ${confirmed}.`);
  return { email: confirmed };
}

/**
 * Mirrors mailbox stats and the newest verification code onto the vault record.
 *
 * Deliberately does *not* touch `status`: the lifecycle is the user's to
 * advance, because the tool cannot know whether Discord actually accepted the
 * registration. Only the observable facts - message count, unread, code - are
 * written back here.
 */
async function syncVaultStats(email: string, messages: readonly TempMailMessage[]): Promise<void> {
  const accounts = await AccountVault.list();
  const match = accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
  if (!match) return;

  const summaries = toMailSummaries(messages);
  const unreadCount = summaries.filter((summary) => summary.isUnread).length;
  const latestCode = findLatestVerificationCode(messages);

  await AccountVault.save({
    ...match,
    mailCount: summaries.length,
    unreadCount,
    lastMailSyncAt: Date.now(),
    lastVerificationCode: latestCode?.code ?? match.lastVerificationCode,
  });
}

function describePasswordViolation(value: string): string | null {
  return satisfiesPasswordPolicy(value)
    ? null
    : 'Password must be 8+ characters with an uppercase letter, a lowercase letter and a digit.';
}

/** Maps an ApiError onto the handler error taxonomy for the router. */
export function translateApiError(error: unknown): HandlerError {
  if (error instanceof ApiError) return new HandlerError(error.code, error.friendlyMessage);
  return new HandlerError('internal', error instanceof Error ? error.message : String(error));
}
