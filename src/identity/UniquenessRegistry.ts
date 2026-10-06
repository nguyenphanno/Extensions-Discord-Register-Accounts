import type { AccountRecord } from '../shared/types/Account';
import type { IdentityField } from './IdentityProfile';

/** Serialized shape persisted under the `identityRegistry` storage key. */
export interface RegistrySnapshot {
  displayName: string[];
  username: string[];
  email: string[];
}

const EMPTY_SNAPSHOT: RegistrySnapshot = { displayName: [], username: [], email: [] };

/**
 * Collision guard for generated identifiers.
 *
 * Random generation alone collides surprisingly often across a few hundred
 * draws (the birthday problem), and a duplicate display name or handle is
 * exactly what makes a registration attempt fail. This registry keeps a
 * normalized fingerprint of everything already produced - including accounts
 * restored from disk on startup - so the factory can re-roll before spending
 * a network request.
 */
export class UniquenessRegistry {
  private readonly seen: Record<IdentityField, Set<string>> = {
    displayName: new Set<string>(),
    username: new Set<string>(),
    email: new Set<string>(),
  };

  /** Fields are folded to lowercase so `AlexHartley` and `alexhartley` collide. */
  private static fingerprint(value: string): string {
    return value.trim().toLowerCase();
  }

  has(field: IdentityField, value: string): boolean {
    return this.seen[field].has(UniquenessRegistry.fingerprint(value));
  }

  /** Returns `false` when the value was already claimed. */
  claim(field: IdentityField, value: string): boolean {
    const key = UniquenessRegistry.fingerprint(value);
    if (this.seen[field].has(key)) return false;
    this.seen[field].add(key);
    return true;
  }

  /** Claims all three fields at once; rolls back and reports the clash. */
  claimIdentity(identity: {
    discordDisplayName: string;
    discordUsername: string;
    email: string;
  }): IdentityField | null {
    if (this.has('displayName', identity.discordDisplayName)) return 'displayName';
    if (this.has('username', identity.discordUsername)) return 'username';
    if (this.has('email', identity.email)) return 'email';

    this.claim('displayName', identity.discordDisplayName);
    this.claim('username', identity.discordUsername);
    this.claim('email', identity.email);
    return null;
  }

  /** Indexes a persisted account so restored vaults participate in dedupe. */
  indexAccount(account: AccountRecord): void {
    if (account.discordDisplayName) this.claim('displayName', account.discordDisplayName);
    if (account.discordUsername) this.claim('username', account.discordUsername);
    if (account.email) this.claim('email', account.email);
  }

  indexAccounts(accounts: readonly AccountRecord[]): void {
    for (const account of accounts) this.indexAccount(account);
  }

  /** Drops an account's fingerprints, used when the user deletes a record. */
  forgetAccount(account: AccountRecord): void {
    this.seen.displayName.delete(UniquenessRegistry.fingerprint(account.discordDisplayName));
    this.seen.username.delete(UniquenessRegistry.fingerprint(account.discordUsername));
    this.seen.email.delete(UniquenessRegistry.fingerprint(account.email));
  }

  clear(): void {
    this.seen.displayName.clear();
    this.seen.username.clear();
    this.seen.email.clear();
  }

  /** Bounded snapshot: oldest entries are dropped so storage stays small. */
  serialize(limitPerField = 4_000): RegistrySnapshot {
    return {
      displayName: tail([...this.seen.displayName], limitPerField),
      username: tail([...this.seen.username], limitPerField),
      email: tail([...this.seen.email], limitPerField),
    };
  }

  hydrate(snapshot: RegistrySnapshot | null | undefined): void {
    const source = snapshot ?? EMPTY_SNAPSHOT;

    this.seen.displayName = new Set(source.displayName ?? []);
    this.seen.username = new Set(source.username ?? []);
    this.seen.email = new Set(source.email ?? []);
  }

  get counts(): Record<IdentityField, number> {
    return {
      displayName: this.seen.displayName.size,
      username: this.seen.username.size,
      email: this.seen.email.size,
    };
  }
}

function tail(values: string[], limit: number): string[] {
  return values.length <= limit ? values : values.slice(values.length - limit);
}

/** Process-wide instance; the service worker hydrates it once at boot. */
export const identityRegistry = new UniquenessRegistry();
