import type { ExtensionSettings } from '../shared/types/Settings';
import { Logger } from '../shared/logger/Logger';
import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/constants/StorageDefaults';
import { isNonEmptyString } from '../shared/utils/Common';
import { StorageArea } from './StorageArea';
import { StorageKeys } from './StorageKeys';

/**
 * Read/write access to the settings blob.
 *
 * Reads always funnel through `normalizeSettings`, which means a hand-edited
 * storage value, an older schema, or a partially-written patch can never put
 * the runtime into an invalid state (e.g. a 3-character password length).
 */
export const SettingsRepository = {
  async load(): Promise<ExtensionSettings> {
    const stored = await StorageArea.read<Partial<ExtensionSettings>>(StorageKeys.settings);
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };

    return normalizeSettings(stored);
  },

  async save(settings: ExtensionSettings): Promise<ExtensionSettings> {
    const normalized = normalizeSettings(settings);
    await StorageArea.write(StorageKeys.settings, normalized);
    return normalized;
  },

  /** Applies a partial patch on top of what is currently stored. */
  async patch(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.load();
    const next = normalizeSettings({ ...current, ...sanitizePatch(patch) });
    await StorageArea.write(StorageKeys.settings, next);

    Logger.info('settingsUpdated', 'Settings updated.', {
      keys: Object.keys(patch).length,
    });

    return next;
  },

  async reset(): Promise<ExtensionSettings> {
    const fresh = { ...DEFAULT_SETTINGS };
    await StorageArea.write(StorageKeys.settings, fresh);
    Logger.info('settingsUpdated', 'Settings restored to defaults.');
    return fresh;
  },
};

/**
 * Drops `undefined` entries so a React `{ ...spread }` of an optional field
 * cannot erase a real value by accident.
 */
function sanitizePatch(patch: Partial<ExtensionSettings>): Partial<ExtensionSettings> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (typeof value === 'string' && key !== 'pinnedDomain') {
      if (!isNonEmptyString(value) && key !== 'apiBaseUrl') continue;
    }

    out[key] = value;
  }

  return out as Partial<ExtensionSettings>;
}
