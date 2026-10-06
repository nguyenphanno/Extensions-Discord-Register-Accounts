import { Logger } from '../shared/logger/Logger';
import { MAILBOX_SYNC_MIN_SECONDS } from '../shared/constants/AppConstants';

const ALARM_NAME = 'dra:mailbox-sync';

/**
 * Drives the periodic mailbox refresh.
 *
 * `chrome.alarms` is used rather than `setInterval` because an MV3 worker is
 * suspended after ~30s of inactivity: a timer would simply stop firing and the
 * inbox would silently go stale. Alarms survive suspension and re-wake the
 * worker, which is the only reliable scheduling primitive here.
 */
export const MailboxScheduler = {
  async sync(intervalSeconds: number, enabled: boolean): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME);

    if (!enabled) {
      Logger.debug('mailboxSynced', 'Mailbox auto-sync disabled.');
      return;
    }

    const periodInMinutes = Math.max(MAILBOX_SYNC_MIN_SECONDS, intervalSeconds) / 60;

    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes,
      // First tick one period out; a sync on every worker boot would burn the
      // request budget just from routine navigation.
      delayInMinutes: periodInMinutes,
    });

    Logger.debug('mailboxSynced', `Mailbox auto-sync scheduled every ${intervalSeconds}s.`, {
      intervalSeconds,
    });
  },

  async stop(): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME);
  },

  isSyncAlarm(alarm: chrome.alarms.Alarm): boolean {
    return alarm.name === ALARM_NAME;
  },
};

export { ALARM_NAME };
