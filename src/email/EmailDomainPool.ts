import { FALLBACK_DOMAINS } from '../shared/constants/AppConstants';
import { pickOne, shuffle } from '../shared/utils/Random';

/** Longest local part most providers accept; also comfortably under the RFC limit of 64. */
const MAX_LOCAL_PART_LENGTH = 40;
const MAX_DOMAIN_LENGTH = 253;

const LOCAL_PART_PATTERN = /^[a-z0-9][a-z0-9._-]{0,38}[a-z0-9]$/;
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * In-memory view of the domain list returned by `GET /domains`.
 *
 * The pool decides *which* domain a new address lands on. When the user has
 * pinned a domain we honour it exactly; otherwise preferred domains win the
 * lottery and everything else stays reachable so a dead domain never blocks
 * generation entirely.
 */
export class EmailDomainPool {
  private domains: string[] = [];
  private preferred: string[] = [];
  private pinned: string | null = null;

  setDomains(domains: readonly string[]): void {
    this.domains = dedupeValidDomains(domains);
  }

  setPreferred(preferred: readonly string[]): void {
    this.preferred = dedupeValidDomains(preferred);
  }

  setPinned(domain: string | null): void {
    if (!domain) {
      this.pinned = null;
      return;
    }
    const normalized = normalizeDomain(domain);
    this.pinned = isValidDomain(normalized) ? normalized : null;
  }

  /** Uses the baked-in fallback list; for offline or first-run generation. */
  useFallback(): void {
    this.domains = dedupeValidDomains(FALLBACK_DOMAINS);
  }

  get isPopulated(): boolean {
    return this.domains.length > 0;
  }

  get all(): readonly string[] {
    return this.domains;
  }

  /** The domain the next address should use, or `null` when none is known. */
  nextDomain(): string | null {
    if (this.pinned) return this.pinned;
    if (this.domains.length === 0) return null;

    const available = this.preferred.filter((domain) => this.domains.includes(domain));
    // 78% preferred / 22% exploration keeps a favourite sticky without making
    // it the only domain ever used.
    if (available.length > 0 && Math.random() < 0.78) {
      return pickOne(available);
    }

    return pickOne(this.domains);
  }

  /** Randomised rotation used when several addresses are minted back to back. */
  rotation(): string[] {
    if (this.pinned) return [this.pinned];
    const available = this.preferred.filter((domain) => this.domains.includes(domain));
    return available.length > 0 ? shuffle(available) : shuffle(this.domains);
  }
}

export function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
}

export function isValidDomain(raw: string): boolean {
  const domain = normalizeDomain(raw);
  return domain.length <= MAX_DOMAIN_LENGTH && DOMAIN_PATTERN.test(domain);
}

export function dedupeValidDomains(domains: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of domains) {
    const domain = normalizeDomain(raw);
    if (!domain || seen.has(domain) || !isValidDomain(domain)) continue;
    seen.add(domain);
    out.push(domain);
  }

  return out;
}

/**
 * Splits and validates an address in one pass.
 * Returns `null` rather than throwing so callers can present a field error.
 */
export function splitEmailAddress(address: string): { localPart: string; domain: string } | null {
  const value = address.trim().toLowerCase();
  const atIndex = value.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === value.length - 1) return null;

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (!LOCAL_PART_PATTERN.test(localPart) || !isValidDomain(domain)) return null;
  if (localPart.length > MAX_LOCAL_PART_LENGTH) return null;

  return { localPart, domain };
}

export function isValidEmailAddress(address: string): boolean {
  return splitEmailAddress(address) !== null;
}

export { MAX_LOCAL_PART_LENGTH };
