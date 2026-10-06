import { PASSWORD_AMBIGUOUS_CHARS, PASSWORD_MIN_LENGTH } from '../shared/constants/AppConstants';
import { clamp } from '../shared/utils/Common';
import { randomFromAlphabet, shuffle } from '../shared/utils/Random';

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const LOWERCASE_SAFE = 'abcdefghijkmnpqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const UPPERCASE_SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const DIGITS_SAFE = '23456789';

/**
 * Symbol set intentionally excludes `"`, `'`, `\`, `<`, `>` and backtick.
 * Those characters survive generation fine but break clipboard-to-form pastes
 * and shell/CSV round-trips often enough to not be worth the entropy.
 */
const SYMBOLS = '!@#$%^&*_-+=?';
const SYMBOLS_SAFE = '!@#$%^&*_-+=?';

export interface PasswordPolicy {
  length: number;
  includeSymbols: boolean;
  avoidAmbiguous: boolean;
}

export interface GeneratedPassword {
  value: string;
  /** 0-4 estimate used by the strength meter, not a cryptographic claim. */
  strengthScore: number;
  /** Effective alphabet size, surfaced in the UI tooltip. */
  alphabetSize: number;
}

/**
 * Generates passwords that satisfy the backend's documented policy by
 * construction: minimum length, at least one lowercase, one uppercase and one
 * digit. Guaranteeing the classes up front means we never ship a password the
 * `/register` endpoint will reject with a 400.
 */
export function generatePassword(policy: PasswordPolicy): GeneratedPassword {
  const length = Math.max(PASSWORD_MIN_LENGTH, clamp(policy.length, PASSWORD_MIN_LENGTH, 64));
  const avoid = policy.avoidAmbiguous;

  const lower = avoid ? LOWERCASE_SAFE : LOWERCASE;
  const upper = avoid ? UPPERCASE_SAFE : UPPERCASE;
  const digit = avoid ? DIGITS_SAFE : DIGITS;
  const symbol = avoid ? SYMBOLS_SAFE : SYMBOLS;

  const pools: string[] = [lower, upper, digit];
  if (policy.includeSymbols) pools.push(symbol);

  // One character is reserved per pool so every required class is present.
  const reserved = pools.map((pool) => randomFromAlphabet(pool, 1));
  const fillAlphabet = pools.join('');
  const fillCount = Math.max(0, length - reserved.length);
  const filler = randomFromAlphabet(fillAlphabet, fillCount);

  const value = shuffle([...reserved, ...filler]).join('');
  const alphabetSize = fillAlphabet.length;

  return {
    value,
    alphabetSize,
    strengthScore: estimateStrength(value, alphabetSize),
  };
}

/** Rotates only the trailing characters, preserving the required classes. */
export function rotatePasswordValue(current: string, policy: PasswordPolicy): GeneratedPassword {
  return generatePassword({ ...policy, length: Math.max(current.length, policy.length) });
}

function estimateStrength(value: string, alphabetSize: number): number {
  if (value.length === 0 || alphabetSize <= 1) return 0;

  const bits = value.length * Math.log2(alphabetSize);

  if (bits >= 128) return 4;
  if (bits >= 96) return 3;
  if (bits >= 64) return 2;
  if (bits >= 40) return 1;
  return 0;
}

/** Explains why a password was rejected, or `null` when it is acceptable. */
export function describePolicyViolation(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(value)) return 'Password needs at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Password needs at least one uppercase letter.';
  if (!/[0-9]/.test(value)) return 'Password needs at least one digit.';
  if ([...value].some((char) => char.trim().length === 0)) {
    return 'Password cannot contain whitespace.';
  }
  return null;
}

/** Convenience predicate used by the vault import validator. */
export function satisfiesPasswordPolicy(value: string): boolean {
  return describePolicyViolation(value) === null;
}

export const AMBIGUOUS_LOOKUP = new Set(PASSWORD_AMBIGUOUS_CHARS.split(''));
