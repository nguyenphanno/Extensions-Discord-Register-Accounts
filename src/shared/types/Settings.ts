/** Deterministic strategy used to compose a Discord display name. */
export type DisplayNameFormat =
  | 'adjectiveNoun'
  | 'adjectiveNounNumber'
  | 'verbAdjectiveNoun'
  | 'capitalizedFullName'
  | 'lowercaseFullName';

/** Deterministic strategy used to compose a Discord `@handle`. */
export type UsernameStyle =
  | 'lowercase'
  | 'lowercaseDotSuffix'
  | 'lowercaseNumberSuffix'
  | 'capitalized';

/** Shape of the local part that precedes `@` in a generated mailbox. */
export type EmailLocalPartStyle =
  | 'wordPairDigits'
  | 'singleWordDigits'
  | 'opaqueToken';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/** Visual theme variant. Both are Discord-native palettes. */
export type ThemeVariant = 'discordDark' | 'discordMidnight';

export interface ExtensionSettings {
  /** Temp-mail backend origin, trailing slash stripped at runtime. */
  apiBaseUrl: string;
  /** Domain pinned in the generator, or `null` to pick one at random. */
  pinnedDomain: string | null;
  /** Domains the user marked as preferred; preferred ones win the lottery. */
  preferredDomains: string[];
  /** Re-fetch `/domains` automatically before each generation. */
  refreshDomainsBeforeGenerate: boolean;
  /** Fallback list used when the network is unavailable. */
  offlineDomainFallback: string[];

  displayNameFormat: DisplayNameFormat;
  usernameStyle: UsernameStyle;

  passwordLength: number;
  passwordIncludeSymbols: boolean;
  /** Exclude `O0Il1` so codes stay readable when typed by hand. */
  passwordAvoidAmbiguous: boolean;

  emailLocalPartStyle: EmailLocalPartStyle;
  emailDigitSuffixLength: number;
  /** Re-roll when the local part collides with the local uniqueness registry. */
  enforceUniqueIdentities: boolean;
  /** Attempts before the factory gives up and widens the entropy budget. */
  uniquenessRetryBudget: number;

  birthdayAgeMin: number;
  birthdayAgeMax: number;

  autoSyncMailbox: boolean;
  mailboxSyncIntervalSeconds: number;
  /** Surface a toast when a new verification code lands. */
  notifyOnVerificationCode: boolean;
  /** Download images referenced by remote `body_html` payloads. */
  loadRemoteMailImages: boolean;

  /** Re-validate stored Discord tokens on a timer so dead ones surface. */
  tokenHealthCheckEnabled: boolean;
  tokenHealthCheckIntervalHours: number;

  maxStoredAccounts: number;
  /** Seconds before copied secrets are wiped from the clipboard (0 = never). */
  clipboardClearSeconds: number;
  revealSecretsByDefault: boolean;
  confirmDestructiveActions: boolean;

  theme: ThemeVariant;
  reduceMotion: boolean;
  logLevel: LogLevel;

  /** Floating launcher injected on Discord pages (the auto-show surface). */
  showPageLauncher: boolean;
  launcherEdge: 'right' | 'left';
  /** Collapsed to a small dot instead of the full pill. */
  launcherCompact: boolean;
}
