import type { DisplayNameFormat, UsernameStyle } from '../shared/types/Settings';

/** A generated identity before it is paired with a mailbox. */
export interface IdentityDraft {
  discordDisplayName: string;
  discordUsername: string;
  discordPassword: string;
  /** `YYYY-MM-DD` */
  birthday: string;
  avatarSeed: string;
  locale: string;
}

/** Deterministic visual description of a Discord-style letter avatar. */
export interface AvatarDescriptor {
  initials: string;
  gradientFrom: string;
  gradientTo: string;
  /** Degrees, used as the `linear-gradient` angle. */
  angle: number;
}

/** Fields the uniqueness registry tracks. */
export type IdentityField = 'displayName' | 'username' | 'email';

export interface GeneratorContext {
  displayNameFormat: DisplayNameFormat;
  usernameStyle: UsernameStyle;
  passwordLength: number;
  passwordIncludeSymbols: boolean;
  passwordAvoidAmbiguous: boolean;
  emailDigitSuffixLength: number;
  birthdayAgeMin: number;
  birthdayAgeMax: number;
}
