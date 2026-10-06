import type { MailSummary, TempMailMessage } from '../shared/types/Mail';
import { parseFromHeader, buildPreview, extractReadableText } from './MailTextExtractor';
import { extractVerificationCode } from './VerificationCodeExtractor';

/**
 * Turns a wire message into the shape the inbox list renders.
 * All derivation happens here so the React layer never parses dates or scans
 * for codes during render.
 */
export function toMailSummary(message: TempMailMessage): MailSummary {
  const { displayName, address } = parseFromHeader(message.from_addr);
  const body = message.body_text?.trim() || extractReadableText(message.body_html);

  const verification = extractVerificationCode({
    subject: message.subject,
    bodyText: message.body_text,
    bodyHtml: message.body_html,
  });

  return {
    id: message.id,
    subject: message.subject || '(no subject)',
    fromAddress: address,
    fromDisplayName: displayName,
    receivedAt: parseMailDate(message.date),
    preview: buildPreview(body),
    hasAttachments: message.has_attachments,
    isUnread: !message.flags.some((flag) => flag.toLowerCase().includes('seen')),
    size: message.size,
    verificationCode: verification?.code ?? null,
  };
}

export function toMailSummaries(messages: readonly TempMailMessage[]): MailSummary[] {
  return messages
    .map(toMailSummary)
    .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));
}

/**
 * The backend returns a local-naive timestamp (`2025-11-29T10:35:00`) with no
 * zone suffix. `new Date(string)` would interpret that as UTC and shift the
 * displayed time, so we append the local offset explicitly.
 */
export function parseMailDate(value: string): number | null {
  if (!value) return null;

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');

  const parsed = Date.parse(hasZone ? normalized : `${normalized}${localOffsetSuffix()}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function localOffsetSuffix(reference: Date = new Date()): string {
  const offsetMinutes = -reference.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = `${Math.floor(absolute / 60)}`.padStart(2, '0');
  const minutes = `${absolute % 60}`.padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/** Stable key for list rendering; falls back to the numeric id. */
export function messageKey(message: TempMailMessage): string {
  return message.message_id?.trim() || `id:${message.id}`;
}

/** Highest-confidence code across a whole inbox snapshot. */
export function findLatestVerificationCode(
  messages: readonly TempMailMessage[],
): { code: string; subject: string } | null {
  for (const message of toMailSummaries(messages)) {
    if (message.verificationCode) {
      return { code: message.verificationCode, subject: message.subject };
    }
  }
  return null;
}

export type { MailSummary, TempMailMessage };
