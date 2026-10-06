import { pickOne } from '../shared/utils/Random';

/**
 * Locale tags offered to the generator.
 * Restricted to the locales Discord ships UI translations for, since the tag
 * is meant to look plausible in the signup flow rather than advertise a
 * region the user is not in.
 */
export const SUPPORTED_LOCALES: readonly string[] = [
  'en-US', 'en-GB', 'en-AU', 'en-CA',
  'de', 'fr', 'es-ES', 'es-419',
  'pt-BR', 'it', 'nl', 'sv-SE',
  'da', 'fi', 'nb', 'pl',
  'cs', 'tr', 'ru', 'uk',
  'ja', 'ko', 'zh-CN', 'zh-TW',
  'th', 'vi', 'id', 'hi',
];

export function generateLocale(): string {
  return pickOne(SUPPORTED_LOCALES);
}

/** Human-readable label for a BCP-47 tag, shown beside the flag-less chip. */
export function describeLocale(tag: string): string {
  try {
    const display = new Intl.DisplayNames(['en'], { type: 'language' });
    return display.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Timezone offset string such as `+07:00`, derived from a locale's region. */
export function describeUtcOffset(tag: string, at: Date = new Date()): string {
  const region = tag.split('-')[1] ?? 'UTC';
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: regionToTimeZone(region),
      timeZoneName: 'shortOffset',
    }).formatToParts(at);
    return formatted.find((part) => part.type === 'timeZoneName')?.value ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Best-effort region -> IANA timezone mapping for regions we generate. */
function regionToTimeZone(region: string): string {
  const map: Record<string, string> = {
    US: 'America/New_York',
    GB: 'Europe/London',
    AU: 'Australia/Sydney',
    CA: 'America/Toronto',
    ES: 'Europe/Madrid',
    BR: 'America/Sao_Paulo',
    SE: 'Europe/Stockholm',
    CN: 'Asia/Shanghai',
    TW: 'Asia/Taipei',
    VN: 'Asia/Ho_Chi_Minh',
  };
  return map[region] ?? 'UTC';
}
