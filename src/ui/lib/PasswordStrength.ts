import { describePolicyViolation } from '../../identity/PasswordGenerator';

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface StrengthReport {
  level: StrengthLevel;
  label: string;
  /** Effective character-space estimate, surfaced in the tooltip. */
  searchSpaceBits: number;
  violation: string | null;
}

const LABELS: Record<StrengthLevel, string> = {
  0: 'Too weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Excellent',
};

/**
 * Scores a password for the strength meter.
 *
 * The estimate is the same log2(alphabet x length) model the generator uses,
 * so a password the generator produced always lands in the same bucket as it
 * does here. The meter is guidance for humans, not a cryptographic claim.
 */
export function evaluatePassword(value: string): StrengthReport {
  const violation = describePolicyViolation(value);

  if (value.length === 0) {
    return { level: 0, label: LABELS[0], searchSpaceBits: 0, violation };
  }

  const alphabetSize =
    (/[a-z]/.test(value) ? 26 : 0) +
    (/[A-Z]/.test(value) ? 26 : 0) +
    (/[0-9]/.test(value) ? 10 : 0) +
    (/[^A-Za-z0-9]/.test(value) ? 33 : 0);

  const bits = value.length * Math.log2(Math.max(2, alphabetSize));

  let level: StrengthLevel = 0;
  if (bits >= 128) level = 4;
  else if (bits >= 96) level = 3;
  else if (bits >= 64) level = 2;
  else if (bits >= 40) level = 1;

  // A policy violation caps the score: a password the backend will reject is
  // never shown as "Strong", no matter how much entropy it has.
  if (violation && level > 1) level = 1;

  return {
    level,
    label: violation ? 'Needs work' : LABELS[level],
    searchSpaceBits: Math.round(bits),
    violation,
  };
}

/** Short human explanation reused by Settings and the generator card. */
export function describeStrengthPolicy(): string {
  return 'At least 8 characters with an uppercase letter, a lowercase letter and a digit.';
}
