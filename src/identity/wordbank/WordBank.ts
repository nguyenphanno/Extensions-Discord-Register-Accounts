import { pickOne, randomDigits } from '../../shared/utils/Random';
import { UNIQUE_ADJECTIVES } from './AdjectiveBank';
import { UNIQUE_NOUNS } from './NounBank';
import { FAMILY_NAMES, GIVEN_NAMES, HANDLE_SUFFIXES, UNIQUE_VERBS } from './VerbBank';

/**
 * The single entry point for word-pool access.
 * Generators never import a bank directly - that keeps the "how do we pick a
 * word" decision in one place and makes the pools swappable for testing.
 */
export const WordBank = {
  adjective(): string {
    return pickOne(UNIQUE_ADJECTIVES);
  },

  noun(): string {
    return pickOne(UNIQUE_NOUNS);
  },

  verb(): string {
    return pickOne(UNIQUE_VERBS);
  },

  handleSuffix(): string {
    return pickOne(HANDLE_SUFFIXES);
  },

  givenName(): string {
    return pickOne(GIVEN_NAMES);
  },

  familyName(): string {
    return pickOne(FAMILY_NAMES);
  },

  /**
   * Digit run used to disambiguate names and handles.
   * `width` is the *minimum*; wider groups are chosen with decreasing
   * probability so short, memorable suffixes stay common while collisions
   * remain vanishingly rare across large batches.
   */
  numericSuffix(width: number): string {
    const roll = Math.random();
    const extra = roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2;
    const length = Math.max(1, Math.round(width)) + extra;
    const value = randomDigits(length);
    // Never emit a leading zero: `alex.0291` looks like a typo, `alex.291` does not.
    return value.startsWith('0') ? `7${value.slice(1)}` : value;
  },

  /** Population counts, surfaced in the Settings UI so users can gauge entropy. */
  get size(): { adjectives: number; nouns: number; verbs: number; suffixes: number } {
    return {
      adjectives: UNIQUE_ADJECTIVES.length,
      nouns: UNIQUE_NOUNS.length,
      verbs: UNIQUE_VERBS.length,
      suffixes: HANDLE_SUFFIXES.length,
    };
  },

  /**
   * Worst-case number of distinct two-word `adjectiveNoun` combinations.
   * Displayed as a "space" metric, not a security guarantee.
   */
  get pairSpace(): number {
    return UNIQUE_ADJECTIVES.length * UNIQUE_NOUNS.length;
  },
} as const;
