import { Logger } from '../shared/logger/Logger';
import { describeError } from '../shared/utils/Common';
import type { StorageKey } from './StorageKeys';

/**
 * Thin, promise-based facade over `chrome.storage.local`.
 *
 * Two reasons this exists instead of calling `chrome.storage` directly:
 *  - every read is validated before it reaches business code, so a corrupted
 *    or partially-written value degrades to a default rather than a crash;
 *  - a page reload can rip the extension context away mid-await, and the
 *    resulting `Extension context invalidated` rejection would otherwise
 *    surface as an unhandled error in every call site.
 */
export const StorageArea = {
  async read<TValue>(key: StorageKey): Promise<TValue | null> {
    if (!isExtensionContextAlive()) return null;

    try {
      const bag = await chrome.storage.local.get(key);
      const value = bag[key];
      return value === undefined ? null : (value as TValue);
    } catch (error) {
      Logger.warn('warning', `Could not read "${key}" from storage.`, {
        reason: describeError(error),
      });
      return null;
    }
  },

  async write<TValue>(key: StorageKey, value: TValue): Promise<boolean> {
    if (!isExtensionContextAlive()) return false;

    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      Logger.error('warning', `Could not persist "${key}".`, error);
      return false;
    }
  },

  async remove(key: StorageKey): Promise<void> {
    if (!isExtensionContextAlive()) return;
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      Logger.warn('warning', `Could not remove "${key}".`, { reason: describeError(error) });
    }
  },

  async removeMany(keys: readonly StorageKey[]): Promise<number> {
    if (!isExtensionContextAlive()) return 0;
    try {
      await chrome.storage.local.remove([...keys]);
      return keys.length;
    } catch (error) {
      Logger.warn('warning', 'Could not remove the requested storage keys.', {
        reason: describeError(error),
      });
      return 0;
    }
  },

  /** Approximate footprint, shown on the About screen. */
  async usageBytes(): Promise<number> {
    if (!isExtensionContextAlive()) return 0;
    try {
      const snapshot = await chrome.storage.local.get(null);
      return new Blob([JSON.stringify(snapshot)]).size;
    } catch {
      return 0;
    }
  },
};

/**
 * `chrome.runtime.id` disappears once the extension is reloaded or updated
 * while a page keeps the old script alive. Checking first avoids a wave of
 * console noise that looks like data loss but is not.
 */
export function isExtensionContextAlive(): boolean {
  try {
    return typeof chrome !== 'undefined' && chrome.runtime?.id !== undefined;
  } catch {
    return false;
  }
}
