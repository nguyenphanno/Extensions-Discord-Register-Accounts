import type { EmailLocalPartStyle } from '../shared/types/Settings';
import { pickOne, randomDigits, randomFromAlphabet } from '../shared/utils/Random';
import { WordBank } from '../identity/wordbank/WordBank';

const WORD_SAFE = 'abcdefghijklmnopqrstuvwxyz';
const OPAQUE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export interface LocalPartOptions {
  style: EmailLocalPartStyle;
  digitLength: number;
}

/**
 * Builds the part before the `@`.
 *
 * All three styles produce `[a-z0-9]` only. That is not cosmetic: temp-mail
 * providers commonly reject local parts with dots, `+tags` or capitals, and a
 * rejected address wastes a `/register` request against the rate limit.
 */
export function generateLocalPart(options: LocalPartOptions): string {
  const digits = Math.max(2, Math.round(options.digitLength));

  switch (options.style) {
    case 'wordPairDigits': {
      const left = WordBank.adjective().toLowerCase();
      const right = WordBank.noun().toLowerCase();
      return `${left}${right}${numericSuffix(digits)}`;
    }
    case 'singleWordDigits': {
      const word = pickOne([WordBank.adjective(), WordBank.noun()]).toLowerCase();
      return `${word}${numericSuffix(digits)}`;
    }
    case 'opaqueToken': {
      // Pure entropy for cases where a readable address is undesirable.
      return randomFromAlphabet(OPAQUE_ALPHABET, Math.max(10, digits + 8));
    }
    default: {
      const unreachable: never = options.style;
      throw new Error(`Unsupported local part style: ${String(unreachable)}`);
    }
  }
}

/**
 * Digit run appended to readable local parts.
 * Mirrors {@link WordBank.numericSuffix} semantics but works on raw digits so
 * the local part never depends on display-name formatting choices.
 */
function numericSuffix(width: number): string {
  const roll = Math.random();
  const extra = roll < 0.7 ? 0 : roll < 0.93 ? 1 : 2;
  const raw = randomDigits(width + extra);
  return raw.startsWith('0') ? `9${raw.slice(1)}` : raw;
}

/** Local part as used by the fallback builder when the API is unreachable. */
export function generateReadableLocalPart(): string {
  return `${WordBank.adjective().toLowerCase()}${WordBank.noun().toLowerCase()}${randomDigits(4)}`;
}

/** Letters-only variant used when a provider forbids digits in local parts. */
export function generateLettersOnlyLocalPart(): string {
  return `${WordBank.adjective().toLowerCase()}${WordBank.noun().toLowerCase()}${randomFromAlphabet(WORD_SAFE, 5)}`;
}
