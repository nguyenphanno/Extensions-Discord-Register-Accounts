import { Logger } from '../shared/logger/Logger';
import type { TokenStatus } from '../shared/types/Account';

/** Shape returned by Discord's `GET /api/v9/users/@me`. */
interface DiscordSelfUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  avatar_decoration?: { asset?: string } | string | null;
  discriminator?: string;
  public_flags?: number;
  flags?: number;
  verified?: boolean;
  email?: string;
  premium_type?: number;
  phone?: string | null;
}

export interface DiscordProfile {
  userId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  avatarDecorationUrl: string | null;
  badges: string[];
  nitroTier: 'none' | 'basic' | 'full' | 'boost';
  verifiedEmail: boolean;
  phoneLocked: boolean;
  createdAt: number;
  status: TokenStatus;
}

/** Discord public flag bits we surface as badges. */
const PUBLIC_FLAGS: Record<number, string> = {
  1: 'Staff',
  2: 'Partner',
  4: 'Hypesquad',
  8: 'BugHunterLevel1',
  16: 'HouseBravery',
  32: 'HouseBrilliance',
  64: 'HouseBalance',
  128: 'EarlySupporter',
  256: 'BugHunterLevel2',
  512: 'VerifiedBot',
  1024: 'VerifiedDeveloper',
  16384: 'ActiveDeveloper',
  131072: 'Premium',
};

const DISCORD_API = 'https://discord.com/api/v9';

/**
 * Fetches the account behind a token and maps it to vault fields.
 * Throws with a friendly message when Discord rejects the token.
 */
export async function fetchDiscordProfile(token: string): Promise<DiscordProfile> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new ProfileError('dead', 'Discord rejected that token. It is expired or invalid.');
  }

  if (response.status === 429) {
    throw new ProfileError('rateLimited', 'Discord rate-limited the profile check. Try again shortly.');
  }

  if (!response.ok) {
    throw new ProfileError('network', `Discord returned ${response.status} while fetching the profile.`);
  }

  const user = (await response.json()) as DiscordSelfUser;
  if (!user?.id) {
    throw new ProfileError('internal', 'Discord returned an unexpected profile payload.');
  }

  const publicFlags = user.public_flags ?? user.flags ?? 0;
  const badges = Object.entries(PUBLIC_FLAGS)
    .filter(([bit]) => (publicFlags & Number(bit)) !== 0)
    .map(([, label]) => label);

  // Nitro premium_type: 0 none, 1 classic/basic, 2 full (with boosts), 3 boost.
  const nitroTier: DiscordProfile['nitroTier'] =
    user.premium_type === 3 ? 'boost' : user.premium_type === 2 ? 'full' : user.premium_type === 1 ? 'basic' : 'none';

  const status: TokenStatus =
    user.verified === true ? 'live' : 'unverified';

  return {
    userId: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    avatarUrl: buildAvatarUrl(user.id, user.avatar),
    avatarDecorationUrl: buildDecorationUrl(user.avatar_decoration),
    badges,
    nitroTier,
    verifiedEmail: user.verified === true,
    // A valid token with no phone on a fresh account usually means Discord
    // will demand phone verification; surface it as a warning, not a failure.
    phoneLocked: user.phone == null,
    createdAt: snowflakeToDate(user.id),
    status,
  };
}

/** Builds a CDN avatar URL, falling back to Discord's default embed. */
function buildAvatarUrl(userId: string, avatarHash: string | null | undefined): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`;
}

/** Avatar decorations are served from a separate asset path. */
function buildDecorationUrl(
  decoration: DiscordSelfUser['avatar_decoration'],
): string | null {
  if (!decoration) return null;
  const asset = typeof decoration === 'string' ? decoration : decoration.asset;
  if (!asset) return null;
  return `https://cdn.discordapp.com/avatar-decorationations/${asset}.png?size=64&pa=0`;
}

/** Extracts the millisecond timestamp from a Discord snowflake ID. */
function snowflakeToDate(id: string): number {
  const DISCORD_EPOCH = 1420070400000;
  const numeric = BigInt(id);
  const ms = (numeric >> 22n) + BigInt(DISCORD_EPOCH);
  return Number(ms);
}

/** Failure carrying the error code the router should report. */
export class ProfileError extends Error {
  constructor(
    public readonly code: 'dead' | 'rateLimited' | 'network' | 'internal',
    message: string,
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}

export function logProfileFetch(profile: DiscordProfile): void {
  Logger.success('accountSaved', `Fetched Discord profile for ${profile.username}.`, {
    userId: profile.userId,
    status: profile.status,
  });
}

