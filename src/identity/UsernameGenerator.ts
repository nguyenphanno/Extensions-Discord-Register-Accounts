import type { UsernameStyle } from '../shared/types/Settings';
import { USERNAME_MAX_LENGTH } from '../shared/constants/AppConstants';
import { WordBank } from './wordbank/WordBank';

/**
 * Discord handles accept `a-z`, `0-9`, `.` and `_` only.
 * Anything else is stripped rather than transliterated so the result stays
 * faithful to the source words.
 */
const ALLOWED_PATTERN = /[^a-z0-9._]/g;

export function generateUsername(style: UsernameStyle): string {
  const candidate = buildForStyle(style);
  return sanitizeUsername(candidate);
}

function buildForStyle(style: UsernameStyle): string {
  switch (style) {
    case 'lowercase': {
      return `${WordBank.adjective()}${WordBank.noun()}`.toLowerCase();
    }
    case 'lowercaseDotSuffix': {
      return `${WordBank.adjective()}.${WordBank.noun()}`.toLowerCase();
    }
    case 'lowercaseNumberSuffix': {
      return `${WordBank.adjective()}${WordBank.noun()}${WordBank.numericSuffix(3)}`.toLowerCase();
    }
    case 'capitalized': {
      // Discord lowercases handles server-side anyway; we keep the casing so the
      // generator output reads well when shown in the vault.
      return `${WordBank.adjective()}${WordBank.noun()}`;
    }
    default: {
      const unreachable: never = style;
      throw new Error(`Unsupported username style: ${String(unreachable)}`);
    }
  }
}

/**
 * Normalizes arbitrary text into a syntactically valid Discord handle.
 * Also repairs the shapes Discord rejects outright: leading/trailing `.`,
 * doubled dots, and a length under the 2-character floor.
 */
export function sanitizeUsername(raw: string): string {
  let value = raw.toLowerCase().replace(ALLOWED_PATTERN, '');

  value = value.replace(/\.{2,}/g, '.');
  value = value.replace(/^[._]+/, '').replace(/[._]+$/, '');

  if (value.length > USERNAME_MAX_LENGTH) {
    value = value.slice(0, USERNAME_MAX_LENGTH).replace(/[._]+$/, '');
  }

  if (value.length < 2) {
    value = `${WordBank.adjective()}${WordBank.noun()}`.toLowerCase();
  }

  return value;
}

/** True when `value` would be accepted by Discord's signup handle validator. */
export function isValidUsername(value: string): boolean {
  return (
    value.length >= 2 &&
    value.length <= USERNAME_MAX_LENGTH &&
    /^[a-z0-9._]+$/.test(value) &&
    !value.startsWith('.') &&
    !value.endsWith('.') &&
    !value.includes('..')
  );
}
