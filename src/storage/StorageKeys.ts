/**
 * Every `chrome.storage.local` key the extension uses.
 * Centralised so a typo becomes a compile error instead of a silent no-op write,
 * and so the "clear data" migration can enumerate what it owns.
 */
export const StorageKeys = {
  settings: 'dra:settings',
  settingsSchema: 'dra:settings:schema',

  accounts: 'dra:accounts',
  accountsSchema: 'dra:accounts:schema',

  activity: 'dra:activity',

  domainCache: 'dra:domains:cache',
  identityRegistry: 'dra:registry',

  mailboxTimer: 'dra:mailbox:timer',
  installMeta: 'dra:install:meta',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

/** Keys wiped by "Clear everything". Ordered for readable logging. */
export const ALL_STORAGE_KEYS: readonly StorageKey[] = Object.values(StorageKeys);
