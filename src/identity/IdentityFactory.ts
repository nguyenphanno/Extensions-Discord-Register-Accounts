import type { ExtensionSettings } from '../shared/types/Settings';
import { DEFAULT_SETTINGS } from '../shared/constants/StorageDefaults';
import { createAvatarSeed, createId } from '../shared/utils/Id';
import type { IdentityDraft } from './IdentityProfile';
import { generateBirthday, sanitizeAgeWindow } from './BirthdayGenerator';
import { generateDisplayName } from './DisplayNameGenerator';
import { generatePassword } from './PasswordGenerator';
import { generateUsername } from './UsernameGenerator';
import { generateLocale } from './LocaleGenerator';
import type { UniquenessRegistry } from './UniquenessRegistry';

export interface IdentityFactoryOptions {
  settings: ExtensionSettings;
  registry: UniquenessRegistry;
}

/** Explains how many re-rolls a batch needed - surfaced as a UI stat. */
export interface IdentityCreationReport {
  draft: IdentityDraft;
  attempts: number;
  /** True when the final attempt had to force a numeric suffix. */
  forcedDisambiguation: boolean;
}

/**
 * Composes a complete identity, re-rolling until every name-shaped field is
 * globally unique.
 *
 * The retry loop is pure CPU work (no network), so a 50-account batch costs
 * microseconds per rejection. The last-resort branch appends fresh entropy
 * instead of failing, which keeps batch generation from ever partially failing.
 */
export function createIdentity(options: IdentityFactoryOptions): IdentityCreationReport {
  const { settings, registry } = options;
  const ageWindow = sanitizeAgeWindow({
    minAge: settings.birthdayAgeMin,
    maxAge: settings.birthdayAgeMax,
  });

  const budget = settings.enforceUniqueIdentities
    ? Math.max(1, settings.uniquenessRetryBudget)
    : 1;

  for (let attempt = 1; attempt <= budget; attempt += 1) {
    const draft = buildDraft(settings, ageWindow, false);

    const clash =
      registry.has('displayName', draft.discordDisplayName) ||
      registry.has('username', draft.discordUsername);

    if (!clash) {
      registry.claim('displayName', draft.discordDisplayName);
      registry.claim('username', draft.discordUsername);
      return { draft, attempts: attempt, forcedDisambiguation: false };
    }
  }

  // Budget exhausted: guarantee novelty by baking entropy into both names.
  const forced = buildDraft(settings, ageWindow, true);
  registry.claim('displayName', forced.discordDisplayName);
  registry.claim('username', forced.discordUsername);

  return { draft: forced, attempts: budget + 1, forcedDisambiguation: true };
}

/** Convenience wrapper for batch generation; keeps ordering deterministic. */
export function createIdentities(
  options: IdentityFactoryOptions,
  count: number,
): IdentityCreationReport[] {
  const reports: IdentityCreationReport[] = [];
  for (let i = 0; i < Math.max(1, count); i += 1) {
    reports.push(createIdentity(options));
  }
  return reports;
}

function buildDraft(
  settings: ExtensionSettings,
  ageWindow: { minAge: number; maxAge: number },
  forceEntropy: boolean,
): IdentityDraft {
  const displayName = forceEntropy
    ? generateDisplayName('adjectiveNounNumber')
    : generateDisplayName(settings.displayNameFormat);

  const username = forceEntropy
    ? generateUsername('lowercaseNumberSuffix')
    : generateUsername(settings.usernameStyle);

  const password = generatePassword({
    length: settings.passwordLength,
    includeSymbols: settings.passwordIncludeSymbols,
    avoidAmbiguous: settings.passwordAvoidAmbiguous,
  });

  return {
    discordDisplayName: displayName,
    discordUsername: username,
    discordPassword: password.value,
    birthday: generateBirthday(ageWindow),
    // Seeded from a fresh id so two accounts with identical names still get
    // visually distinct avatars.
    avatarSeed: createAvatarSeed(createId('seed')),
    locale: generateLocale(),
  };
}

/** Defaults used when the factory is exercised from tests or a cold boot. */
export const IDENTITY_FACTORY_FALLBACK_SETTINGS: ExtensionSettings = DEFAULT_SETTINGS;
