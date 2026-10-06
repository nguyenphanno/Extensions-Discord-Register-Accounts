/**
 * Periodic re-validation of captured Discord tokens.
 *
 * A token that Discord later revokes is invisible until something tries to use
 * it. This sweep turns that silent failure into a visible chip: every stored
 * token is re-checked against `/users/@me` and its status is refreshed. Tokens
 * already known to be dead are skipped, so the cost of the sweep shrinks as the
 * vault ages.
 *
 * `chrome.alarms` rather than a timer, because an MV3 worker is suspended after
 * ~30s idle and a `setInterval` would simply stop firing.
 */

import { Logger } from '../shared/logger/Logger';
import type { AccountRecord } from '../shared/types/Account';
import { AccountVault } from '../storage/AccountVault';
import { fetchDiscordProfile, ProfileError } from './DiscordProfileService';

const ALARM_NAME = 'dra:token-health';

/** Pause between accounts so a large vault never bursts into Discord at once. */
const PACE_MS = 1_500;

export const TokenHealthCheck = {
  async schedule(intervalHours: number, enabled: boolean): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME);

    if (!enabled) {
      Logger.debug('tokenHealthCheck', 'Token health check disabled.');
      return;
    }

    const periodInMinutes = Math.max(1, intervalHours) * 60;

    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes,
      // First tick a full period out; a sweep on every worker boot would spend
      // the request budget on routine navigation.
      delayInMinutes: periodInMinutes,
    });

    Logger.debug('tokenHealthCheck', `Token health check scheduled every ${intervalHours}h.`, {
      intervalHours,
    });
  },

  async stop(): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME);
  },

  isHealthAlarm(alarm: chrome.alarms.Alarm): boolean {
    return alarm.name === ALARM_NAME;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface HealthCheckSummary {
  checked: number;
  dead: number;
  changed: number;
}

/**
 * Re-checks every live token once. Failures leave the stored status untouched:
 * a network error is not evidence that a token died.
 */
export async function runTokenHealthCheck(): Promise<HealthCheckSummary> {
  const accounts = await AccountVault.list();
  const candidates = accounts.filter(
    (account) => Boolean(account.token) && account.tokenStatus !== 'dead',
  );

  const summary: HealthCheckSummary = { checked: 0, dead: 0, changed: 0 };

  for (const account of candidates) {
    const token = account.token;
    if (!token) continue;

    summary.checked += 1;

    try {
      const profile = await fetchDiscordProfile(token);
      const next = applyProfile(account, profile);

      if (next !== account) {
        await AccountVault.save(next);
        summary.changed += 1;
      }
    } catch (error) {
      if (error instanceof ProfileError && error.code === 'dead') {
        const next: AccountRecord = {
          ...account,
          tokenStatus: 'dead',
          updatedAt: Date.now(),
        };

        await AccountVault.save(next);
        summary.dead += 1;
        summary.changed += 1;

        Logger.warn('tokenHealthCheck', `Token for ${account.email} was rejected by Discord.`, {
          accountId: account.id,
        });
      }
      // Anything else (rate limit, offline) is transient: keep the old status.
    }

    await sleep(PACE_MS);
  }

  if (summary.checked > 0) {
    Logger.info('tokenHealthCheck', `Checked ${summary.checked} token(s): ${summary.dead} dead.`, {
      checked: summary.checked,
      dead: summary.dead,
    });
  }

  return summary;
}

/** Returns a new record when the profile data differs from what is stored. */
function applyProfile(
  account: AccountRecord,
  profile: Awaited<ReturnType<typeof fetchDiscordProfile>>,
): AccountRecord {
  const unchanged =
    account.tokenStatus === profile.status &&
    account.discordUserId === profile.userId &&
    account.avatarUrl === profile.avatarUrl &&
    account.nitroTier === profile.nitroTier &&
    account.phoneLocked === profile.phoneLocked &&
    account.badges.join('|') === profile.badges.join('|');

  if (unchanged) return account;

  return {
    ...account,
    tokenStatus: profile.status,
    discordUserId: profile.userId,
    avatarUrl: profile.avatarUrl,
    avatarDecorationUrl: profile.avatarDecorationUrl,
    badges: profile.badges,
    nitroTier: profile.nitroTier,
    phoneLocked: profile.phoneLocked,
    discordCreatedAt: profile.createdAt,
    profileFetchedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export { ALARM_NAME as TOKEN_HEALTH_ALARM_NAME };

