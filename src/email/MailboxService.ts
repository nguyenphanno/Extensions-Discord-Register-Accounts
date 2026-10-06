import type { ExtensionSettings } from '../shared/types/Settings';
import { Logger } from '../shared/logger/Logger';
import { clamp } from '../shared/utils/Common';
import { DOMAIN_CACHE_TTL_MS, PASSWORD_MIN_LENGTH } from '../shared/constants/AppConstants';
import type { TempMailApi } from '../api/TempMailApi';
import { ApiError } from '../api/ApiError';
import { generatePassword } from '../identity/PasswordGenerator';
import type { UniquenessRegistry } from '../identity/UniquenessRegistry';
import { buildAddress } from './EmailAddressBuilder';
import type { EmailDomainPool } from './EmailDomainPool';
import { generateLocalPart, generateReadableLocalPart } from './EmailLocalPartGenerator';

/** Persistence port so the mailbox layer stays free of `chrome.*` calls. */
export interface DomainCachePort {
  read(): Promise<DomainSnapshot | null>;
  write(snapshot: DomainSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface DomainSnapshot {
  domains: string[];
  fetchedAt: number;
}

export interface ProvisionResult {
  email: string;
  password: string;
  domain: string;
  localPart: string;
}

export interface ProvisionOptions {
  settings: ExtensionSettings;
  registry: UniquenessRegistry;
  /** Skip the network call and mint an address from the cached/fallback pool. */
  offline?: boolean;
}

const MAX_PROVISION_ATTEMPTS = 6;

/**
 * Owns every interaction with a temporary mailbox.
 *
 * Why provisioning is a loop rather than a single call: the exact address we
 * want is not guaranteed to be free, and `/register` answers 409 when it is
 * not. Re-rolling the local part in-process costs nothing, whereas surfacing
 * that conflict to the user burns their attention on a detail the generator
 * can resolve by itself.
 */
export class MailboxService {
  constructor(
    private readonly api: TempMailApi,
    private readonly pool: EmailDomainPool,
    private readonly cache: DomainCachePort,
  ) {}

  /**
   * Populates the domain pool from cache or the network.
   * Falls back to the baked-in list so generation never hard-fails offline.
   */
  async refreshDomains(
    settings: ExtensionSettings,
    force: boolean,
  ): Promise<DomainSnapshot & { fromCache: boolean }> {
    this.pool.setPreferred(settings.preferredDomains);
    this.pool.setPinned(settings.pinnedDomain);

    const cached = await this.cache.read();
    const cacheIsFresh = cached !== null && Date.now() - cached.fetchedAt < DOMAIN_CACHE_TTL_MS;
    const cacheIsUsable = cached !== null && cached.domains.length > 0;

    if (!force && cacheIsFresh && cacheIsUsable) {
      this.pool.setDomains(cached.domains);
      return { domains: [...this.pool.all], fetchedAt: cached.fetchedAt, fromCache: true };
    }

    try {
      const domains = await this.api.listDomains();

      if (domains.length === 0) {
        throw new ApiError({
          code: 'notFound',
          message: 'The mailbox service returned an empty domain list.',
          httpStatus: 200,
          responseCode: 200,
          path: '/domains',
          retryAfterSeconds: null,
        });
      }

      const snapshot: DomainSnapshot = { domains, fetchedAt: Date.now() };
      await this.cache.write(snapshot);
      this.pool.setDomains(domains);

      Logger.success('apiRequest', `Loaded ${domains.length} mailbox domains.`, { count: domains.length });
      return { ...snapshot, fromCache: false };
    } catch (error) {
      if (cacheIsUsable) {
        this.pool.setDomains(cached.domains);
        Logger.warn('apiError', 'Domain refresh failed; using the cached list.', {
          reason: error instanceof ApiError ? error.code : 'unknown',
        });
        return { domains: [...this.pool.all], fetchedAt: cached.fetchedAt, fromCache: true };
      }

      // Nothing cached: degrade to the offline list and say so.
      this.pool.setDomains(settings.offlineDomainFallback);
      if (!this.pool.isPopulated) this.pool.useFallback();

      Logger.warn('apiError', 'Domain refresh failed; using the offline fallback list.');
      return { domains: [...this.pool.all], fetchedAt: Date.now(), fromCache: true };
    }
  }

  /** Reserves a brand-new address, retrying on address collisions. */
  async provision(options: ProvisionOptions): Promise<ProvisionResult> {
    const { settings, registry, offline = false } = options;

    if (!this.pool.isPopulated) {
      this.pool.setDomains(settings.offlineDomainFallback);
      if (!this.pool.isPopulated) this.pool.useFallback();
    }
    this.pool.setPinned(settings.pinnedDomain);
    this.pool.setPreferred(settings.preferredDomains);

    const password = this.mintMailboxPassword(settings);
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt += 1) {
      const domain = this.pool.nextDomain();
      if (!domain) break;

      const localPart = this.mintLocalPart(settings, attempt);
      const address = buildAddress({ localPart, domain });
      if (!address) continue;

      if (registry.has('email', address.email)) {
        Logger.debug('mailboxRegistered', 'Local part already used; re-rolling.', { attempt, localPart });
        continue;
      }

      if (offline) {
        registry.claim('email', address.email);
        return { ...address, password };
      }

      try {
        await this.api.register(address.email, password);
        registry.claim('email', address.email);

        Logger.success('mailboxRegistered', `Mailbox reserved: ${address.email}`, {
          domain: address.domain,
          attempt,
        });

        return { ...address, password };
      } catch (error) {
        lastError = error;

        const isTaken =
          error instanceof ApiError && (error.code === 'conflict' || error.code === 'validation');

        if (isTaken) {
          Logger.debug('mailboxRegistered', 'Address rejected by the server; re-rolling.', {
            attempt,
            status: error instanceof ApiError ? error.code : 'unknown',
          });
          continue;
        }

        throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ApiError({
      code: 'conflict',
      message: 'Could not find an available mailbox address after several attempts.',
      httpStatus: null,
      responseCode: null,
      path: '/register',
      retryAfterSeconds: null,
    });
  }

  /** Mailbox passwords must satisfy the backend policy, so reuse the generator. */
  private mintMailboxPassword(settings: ExtensionSettings): string {
    return generatePassword({
      length: clamp(
        Math.max(settings.passwordLength, PASSWORD_MIN_LENGTH + 4),
        PASSWORD_MIN_LENGTH,
        48,
      ),
      includeSymbols: false,
      avoidAmbiguous: settings.passwordAvoidAmbiguous,
    }).value;
  }

  private mintLocalPart(settings: ExtensionSettings, attempt: number): string {
    // Later attempts switch to a fully opaque token: readable words are a small
    // namespace, and repeated collisions mean we should stop competing for them.
    if (attempt >= MAX_PROVISION_ATTEMPTS - 1) {
      return generateLocalPart({ style: 'opaqueToken', digitLength: settings.emailDigitSuffixLength });
    }

    return (
      generateLocalPart({
        style: settings.emailLocalPartStyle,
        digitLength: settings.emailDigitSuffixLength,
      }) || generateReadableLocalPart()
    );
  }
}
