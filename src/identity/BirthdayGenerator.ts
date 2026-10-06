import { clamp } from '../shared/utils/Common';
import { randomIntBetween } from '../shared/utils/Random';

const MS_PER_DAY = 86_400_000;

export interface BirthdayWindow {
  minAge: number;
  maxAge: number;
}

/**
 * Produces a plausible `YYYY-MM-DD` birthday inside an age window.
 *
 * Two properties matter here:
 *  - the result is always strictly before today, so a signup form that
 *    validates "must be in the past" never rejects it;
 *  - the day is clamped to the real length of the chosen month, so we never
 *    emit `2024-02-30` for a February birthday.
 */
export function generateBirthday(window: BirthdayWindow, reference: Date = new Date()): string {
  const minAge = Math.max(13, Math.round(window.minAge));
  const maxAge = Math.max(minAge, Math.round(window.maxAge));
  const age = randomIntBetween(minAge, maxAge);

  const daysInYear = 365.2425;
  const offsetDays = Math.round(age * daysInYear + randomIntBetween(0, 364));

  const date = new Date(reference.getTime() - offsetDays * MS_PER_DAY);
  if (date.getTime() >= reference.getTime()) {
    date.setTime(reference.getTime() - MS_PER_DAY);
  }

  return formatIsoDate(date);
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` without the UTC shift `new Date(string)` introduces. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const date = new Date(year, month - 1, day);
  // Guards against overflow such as 2024-02-31 silently becoming March 2nd.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Whole years between `birthday` and `reference`, or `null` for bad input. */
export function ageOn(birthday: string, reference: Date = new Date()): number | null {
  const date = parseIsoDate(birthday);
  if (!date) return null;

  let age = reference.getFullYear() - date.getFullYear();
  const monthDelta = reference.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export function sanitizeAgeWindow(window: BirthdayWindow): BirthdayWindow {
  const minAge = clamp(window.minAge, 13, 90);
  return { minAge, maxAge: clamp(Math.max(window.maxAge, minAge), minAge, 110) };
}
