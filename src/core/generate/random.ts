/**
 * Seeded pseudo-random number generation for fixture synthesis.
 *
 * `Math.random()` cannot be seeded, which would make every fixture run produce
 * different data — and therefore different precision and recall figures on the
 * evaluation page. Since fixtures are gitignored rather than committed, there is
 * no diff to reveal such drift, so determinism here is the only thing keeping
 * the accuracy claims reproducible.
 *
 * The algorithm is mulberry32: a well-known 32-bit generator with a period of
 * 2^32, chosen because it is six lines and needs no dependency. Statistical
 * quality is irrelevant here — the requirement is reproducibility, not
 * cryptographic or simulation-grade randomness.
 *
 * @see docs/REQUIREMENTS.md NFR-1.4 — determinism
 * @module
 */

/**
 * A deterministic source of pseudo-random values.
 *
 * Two generators created with the same seed produce identical sequences.
 */
export interface Rng {
  /** Returns the next value in `[0, 1)`. */
  next(): number;
  /**
   * Returns an integer in `[min, max]`, both inclusive.
   *
   * @param min - Lower bound, inclusive.
   * @param max - Upper bound, inclusive.
   */
  int(min: number, max: number): number;
  /**
   * Returns a uniformly chosen element of a non-empty array.
   *
   * @param items - The array to choose from; must not be empty.
   * @throws {RangeError} If `items` is empty.
   */
  pick<T>(items: readonly T[]): T;
  /**
   * Returns `true` with the given probability.
   *
   * @param probability - Chance of `true`, in `[0, 1]`.
   */
  bool(probability: number): boolean;
}

/**
 * Creates a seeded generator.
 *
 * @param seed - Any 32-bit integer. The same seed always yields the same
 *   sequence, which is what makes fixtures reproducible.
 * @returns A deterministic {@link Rng}.
 *
 * @example
 * const rng = createRng(20260904);
 * rng.int(1, 6); // same value on every run, for this seed
 */
export function createRng(seed: number): Rng {
  // Internal state. Kept as a 32-bit integer via `| 0` on every step.
  let state = seed | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,

    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new RangeError(`int bounds must be integers, got ${min}..${max}`);
      }
      if (max < min) {
        throw new RangeError(`int bounds inverted: ${min}..${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('cannot pick from an empty array');
      }
      const chosen = items[Math.floor(next() * items.length)];
      // `noUncheckedIndexedAccess` widens the lookup to `T | undefined`; the
      // index is in range by construction, so this only satisfies the compiler.
      if (chosen === undefined) {
        throw new RangeError('pick produced an out-of-range index');
      }
      return chosen;
    },

    bool(probability: number): boolean {
      return next() < probability;
    },
  };
}
