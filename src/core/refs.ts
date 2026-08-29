/**
 * Reference normalization.
 *
 * The reference printed on a settlement report and the one typed into a ledger
 * rarely match byte for byte: `"ORD-4471"`, `"ord 4471"`, and `"Ord/4471"` are
 * the same order. Matching on the raw string would report these as unmatched,
 * so every record carries a `normalizedRef` alongside its `externalRef`, and the
 * engine keys on the former.
 *
 * Normalization is intentionally lossy but *deterministic*: the same input
 * always reduces to the same output, on both sides of a reconciliation.
 *
 * @module
 */

import { distance } from 'fastest-levenshtein';

/**
 * Reduces a reference to its comparable form.
 *
 * Uppercases, then removes every character that is not a letter or digit. This
 * collapses separator and casing differences while preserving the identifying
 * token, so `"ord-4471"` and `"ORD / 4471"` both become `"ORD4471"`.
 *
 * Note that this deliberately does **not** strip a trailing sequence number:
 * `"ORD-4471-1"` normalizes to `"ORD44711"`, which will not match `"ORD4471"`.
 * That is correct — an instalment is a different record, and pairing it with the
 * whole invoice is the partial-payment tier's job, not the reference tier's.
 *
 * @param raw - The reference exactly as supplied by the source.
 * @returns The normalized form, suitable as a matching key. Empty input yields
 *   an empty string, which callers must treat as "no usable reference" rather
 *   than as a value that can match another empty reference.
 *
 * @example
 * normalizeRef('ORD-4471');   // 'ORD4471'
 * normalizeRef('ord / 4471'); // 'ORD4471'
 */
export function normalizeRef(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Scores how similar two normalized references are, in `[0, 1]`.
 *
 * Uses normalized Levenshtein distance: `1 - distance / length of the longer
 * string`. Identical references score `1`; entirely different ones approach `0`.
 *
 * This is the only external dependency the core takes, and it is a pure
 * function over strings — no I/O, no state — so it does not compromise the rule
 * that `src/core/` stays free of clients and frameworks. It is preferred over a
 * hand-rolled implementation because an edit-distance routine is easy to get
 * subtly wrong at the boundaries, and a wrong distance here means a wrong match.
 *
 * @param a - First normalized reference.
 * @param b - Second normalized reference.
 * @returns Similarity in `[0, 1]`. Two empty strings score `0` rather than `1`,
 *   because a missing reference must never be treated as evidence of a match.
 *
 * @example
 * refSimilarity('ORD4471', 'ORD4471');  // 1
 * refSimilarity('ORD4471', 'ORD4472');  // ~0.857
 */
export function refSimilarity(a: string, b: string): number {
  // An absent reference is not evidence. Scoring two blanks as a perfect match
  // would pair every reference-less record with every other.
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  return 1 - distance(a, b) / longest;
}
