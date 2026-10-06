import type { DisplayNameFormat } from '../shared/types/Settings';
import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from '../shared/constants/AppConstants';
import { toTitleCase, truncate } from '../shared/utils/Common';
import { WordBank } from './wordbank/WordBank';

/**
 * Builds Discord display names.
 *
 * Discord's display name is free-form (unicode + spaces, 1-32 chars after
 * trimming) so we favour readable, human-shaped names over opaque tokens.
 */
export function generateDisplayName(format: DisplayNameFormat): string {
  const candidate = buildForFormat(format);
  return enforceBounds(candidate);
}

function buildForFormat(format: DisplayNameFormat): string {
  switch (format) {
    case 'adjectiveNoun': {
      return `${WordBank.adjective()}${WordBank.noun()}`;
    }
    case 'adjectiveNounNumber': {
      return `${WordBank.adjective()}${WordBank.noun()}${WordBank.numericSuffix(2)}`;
    }
    case 'verbAdjectiveNoun': {
      // Kept to verb + noun: three-word names routinely blow past Discord's 32-char cap.
      return `${WordBank.verb()}${WordBank.noun()}`;
    }
    case 'capitalizedFullName': {
      return `${WordBank.givenName()} ${WordBank.familyName()}`;
    }
    case 'lowercaseFullName': {
      return `${WordBank.givenName()} ${WordBank.familyName()}`.toLowerCase();
    }
    default: {
      // Exhaustiveness guard: a new format must be handled explicitly.
      const unreachable: never = format;
      throw new Error(`Unsupported display name format: ${String(unreachable)}`);
    }
  }
}

function enforceBounds(value: string): string {
  let result = value.replace(/\s+/g, ' ').trim();

  if (result.length < DISPLAY_NAME_MIN_LENGTH) {
    result = `${WordBank.adjective()}${WordBank.noun()}`;
  }

  if (result.length > DISPLAY_NAME_MAX_LENGTH) {
    result = truncate(result, DISPLAY_NAME_MAX_LENGTH);
  }

  return toTitleCase(result.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim())
    .replace(/\s+/g, ' ');
}
