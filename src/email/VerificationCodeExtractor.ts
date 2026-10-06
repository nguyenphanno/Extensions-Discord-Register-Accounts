import type { VerificationCodeMatch } from '../shared/types/Mail';
import { extractReadableText, normalizeWhitespace } from './MailTextExtractor';

/**
 * Finds the code a sender wants you to type into a form.
 *
 * Heuristics are ordered by confidence rather than by position:
 *   1. A code sitting next to an explicit keyword ("code", "verify", "OTP").
 *   2. A bare 4-8 digit run in the subject, which is almost always the code.
 *   3. A bare 4-8 digit run in the body, only accepted when it is unambiguous.
 *
 * Anything numeric-looking that is part of a URL, phone number or timestamp is
 * filtered out first, because those produce far more false positives than real
 * codes produce misses.
 */

const KEYWORD_PATTERN =
  /\b(?:code|otp|pin|passcode|token|verification|verify|confirm|confirmation|activate|activation|security)\w*\b/gi;

/** 4-8 digits, not glued to a longer digit run or to letters. */
const CODE_PATTERN = /(?<![\w\d])(\d{4,8})(?![\w\d])/g;

/** Digit groups we never want to surface as a code. */
const NOISE_PATTERNS: readonly RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, // IPv4
  /\b(?:19|20)\d{2}\b/g, // years
  /\b\d{5,6}\b(?=\s*(?:bytes|KB|MB|GB))/gi, // sizes
];

const MAX_KEYWORD_DISTANCE = 48;

export interface ExtractionOptions {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

/** Returns the highest-confidence code found, or `null`. */
export function extractVerificationCode(options: ExtractionOptions): VerificationCodeMatch | null {
  const subject = normalizeWhitespace(options.subject ?? '');
  const text = options.bodyText?.trim()
    ? normalizeWhitespace(options.bodyText)
    : extractReadableText(options.bodyHtml ?? '');

  return (
    findByKeyword(subject, 'subject') ??
    findByKeyword(text, 'text') ??
    findBare(subject, 'subject') ??
    findBareShortlist(text, 'text')
  );
}

/** Convenience boolean used by the unread badge logic. */
export function containsVerificationCode(options: ExtractionOptions): boolean {
  return extractVerificationCode(options) !== null;
}

/** Scans for a code within {@link MAX_KEYWORD_DISTANCE} of a keyword hit. */
function findByKeyword(haystack: string, source: 'subject' | 'text'): VerificationCodeMatch | null {
  if (!haystack) return null;

  const candidates = new Map<string, number>();

  for (const match of haystack.matchAll(KEYWORD_PATTERN)) {
    const anchor = match.index ?? 0;
    const windowStart = Math.max(0, anchor - MAX_KEYWORD_DISTANCE);
    const windowEnd = Math.min(haystack.length, anchor + match[0].length + MAX_KEYWORD_DISTANCE);
    const window = stripNoise(haystack.slice(windowStart, windowEnd));

    for (const codeMatch of window.matchAll(CODE_PATTERN)) {
      const code = codeMatch[1];
      if (!code) continue;
      // Smaller distance to the keyword ranks higher.
      const distance = Math.abs((codeMatch.index ?? 0) + windowStart - anchor);
      const existing = candidates.get(code);
      if (existing === undefined || distance < existing) candidates.set(code, distance);
    }
  }

  if (candidates.size === 0) return null;

  const [code] = [...candidates.entries()].sort((a, b) => a[1] - b[1])[0] as [string, number];
  return { code, source, confidence: 'high' };
}

/** A bare code in the subject is reliable; there is rarely anything else numeric. */
function findBare(haystack: string, source: 'subject' | 'text'): VerificationCodeMatch | null {
  const cleaned = stripNoise(haystack);
  const matches = [...cleaned.matchAll(CODE_PATTERN)]
    .map((match) => match[1])
    .filter((code): code is string => Boolean(code));

  if (matches.length !== 1) return null;

  return { code: matches[0] as string, source, confidence: 'high' };
}

/**
 * Bodies contain many numbers, so a body-only hit is accepted solely when it is
 * the single isolated candidate. Otherwise the user reads the mail themselves.
 */
function findBareShortlist(haystack: string, source: 'text' | 'subject'): VerificationCodeMatch | null {
  const cleaned = stripNoise(haystack);
  const matches = [...cleaned.matchAll(CODE_PATTERN)]
    .map((match) => match[1])
    .filter((code): code is string => Boolean(code));

  const uniqueCodes = [...new Set(matches)];
  if (uniqueCodes.length !== 1) return null;

  return { code: uniqueCodes[0] as string, source, confidence: 'medium' };
}

/** Removes URLs and known non-code numeric shapes before pattern matching. */
function stripNoise(value: string): string {
  let cleaned = value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/mailto:\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ');

  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned;
}

/** Extracts confirmation links, offered as a one-click action in the reader. */
export function extractActionLinks(bodyText: string, bodyHtml: string): { url: string; label: string }[] {
  const haystack = bodyText?.trim() ? bodyText : extractReadableText(bodyHtml);
  const urls = new Set<string>();

  for (const match of haystack.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    urls.add(match[0].replace(/[.,;:!?]+$/, ''));
  }

  return [...urls]
    .filter((url) => /(verify|confirm|activate|validate|token|auth)/i.test(url))
    .slice(0, 3)
    .map((url) => ({ url, label: describeLink(url) }));
}

function describeLink(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}
