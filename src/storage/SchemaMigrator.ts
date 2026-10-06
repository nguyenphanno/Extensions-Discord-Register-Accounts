import { Logger } from '../shared/logger/Logger';
import { SETTINGS_SCHEMA_VERSION, VAULT_SCHEMA_VERSION } from '../shared/constants/StorageDefaults';
import { StorageArea } from './StorageArea';
import { StorageKeys } from './StorageKeys';

interface InstallMeta {
  installedAt: number;
  updatedAt: number;
  settingsSchema: number;
  vaultSchema: number;
}

/**
 * Forward-only schema migration.
 *
 * The extension stores plain JSON, so "migration" means: bump a version marker
 * and repair shapes that changed. Running it on every service-worker boot is
 * cheap (two key reads) and means no separate upgrade hook can be missed.
 */
export const SchemaMigrator = {
  async run(): Promise<InstallMeta> {
    const existing = await StorageArea.read<InstallMeta>(StorageKeys.installMeta);
    if (!existing || typeof existing !== 'object') {
      return this.bootstrap();
    }

    const meta = existing;
    const settingsSchema = Number.isFinite(meta.settingsSchema) ? meta.settingsSchema : 0;
    const vaultSchema = Number.isFinite(meta.vaultSchema) ? meta.vaultSchema : 0;

    if (settingsSchema < SETTINGS_SCHEMA_VERSION) {
      await this.migrateSettings(settingsSchema);
    }

    if (vaultSchema < VAULT_SCHEMA_VERSION) {
      await this.migrateVault(vaultSchema);
    }

    const next: InstallMeta = {
      installedAt: Number.isFinite(meta.installedAt) ? meta.installedAt : Date.now(),
      updatedAt: Date.now(),
      settingsSchema: SETTINGS_SCHEMA_VERSION,
      vaultSchema: VAULT_SCHEMA_VERSION,
    };

    await StorageArea.write(StorageKeys.installMeta, next);
    return next;
  },

  async bootstrap(): Promise<InstallMeta> {
    const now = Date.now();
    const meta: InstallMeta = {
      installedAt: now,
      updatedAt: now,
      settingsSchema: SETTINGS_SCHEMA_VERSION,
      vaultSchema: VAULT_SCHEMA_VERSION,
    };

    await StorageArea.write(StorageKeys.installMeta, meta);
    Logger.info('warning', 'First run: storage schema initialised.');
    return meta;
  },

  /**
   * v0 -> v1: the settings blob did not exist, so `normalizeSettings` fills it.
   * Future versions append cases here rather than rewriting the whole routine.
   */
  async migrateSettings(fromVersion: number): Promise<void> {
    Logger.warn('warning', `Migrating settings schema from v${fromVersion} to v${SETTINGS_SCHEMA_VERSION}.`);

    const stored = await StorageArea.read<Record<string, unknown>>(StorageKeys.settings);
    if (stored) {
      // Re-writing through the normalizer upgrades unknown shapes in place.
      await StorageArea.write(StorageKeys.settings, stored);
    }

    await StorageArea.write(StorageKeys.settingsSchema, SETTINGS_SCHEMA_VERSION);
  },

  async migrateVault(fromVersion: number): Promise<void> {
    Logger.warn('warning', `Migrating vault schema from v${fromVersion} to v${VAULT_SCHEMA_VERSION}.`);

    const stored = await StorageArea.read<unknown>(StorageKeys.accounts);
    if (!Array.isArray(stored)) {
      await StorageArea.write(StorageKeys.accounts, []);
    }

    await StorageArea.write(StorageKeys.accountsSchema, VAULT_SCHEMA_VERSION);
  },

  async meta(): Promise<InstallMeta | null> {
    return StorageArea.read<InstallMeta>(StorageKeys.installMeta);
  },
};
