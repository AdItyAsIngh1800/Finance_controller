/**
 * Matching predicates and candidate selection.
 *
 * These are the individual judgements the engine composes: whether two amounts
 * are close enough, whether two dates are, which records could plausibly form a
 * partial set. Kept separate from the orchestration in `engine.ts` so each can
 * be reasoned about — and tested — on its own.
 *
 * Everything here is a pure function. No state, no I/O, no clock.
 *
 * @module
 */

import { daysBetween } from '../dates';
import { absMinor, basisPointsOf, maxMinor, subMinor, sumMinor, type Minor } from '../money';
import type { NormalizedRecord, ReconParams } from '../types';

/**
 * Reports whether two amounts agree within the configured tolerance.
 *
 * The tolerance is the greater of a proportional band and an absolute floor, so
 * that both large and small amounts get workable slack. Computed entirely in
 * integer space — no float ever touches the comparison.
 *
 * @param a - First amount.
 * @param b - Second amount.
 * @param params - Thresholds for this run.
 * @returns `true` if the difference falls within tolerance.
 */
export function amountsAgree(a: Minor, b: Minor, params: ReconParams): boolean {
  const delta = absMinor(subMinor(a, b));
  const proportional = basisPointsOf(a, params.amountToleranceBps);
  const tolerance = maxMinor(proportional, params.amountToleranceFloorMinor);
  return delta <= tolerance;
}

/**
 * Reports whether two dates fall inside the configured window.
 *
 * @param a - First date.
 * @param b - Second date.
 * @param params - Thresholds for this run.
 * @returns `true` if the absolute day difference is within the window.
 */
export function datesAgree(a: string, b: string, params: ReconParams): boolean {
  return Math.abs(daysBetween(a, b)) <= params.dateWindowDays;
}

/**
 * Key used by the exact-reference tier.
 *
 * Combines normalized reference and exact amount, so only records agreeing on
 * both collide.
 *
 * @param record - The record to key.
 * @returns A composite key, or `null` when the record has no usable reference.
 */
export function exactRefKey(record: NormalizedRecord): string | null {
  if (record.normalizedRef.length === 0) return null;
  return `${record.normalizedRef}|${record.amountMinor}`;
}

/**
 * Key used by the amount-and-date tier.
 *
 * Amount alone; the date condition is applied afterwards, because records
 * agreeing on amount but differing in date are still candidates whereas a
 * date-bucketed key would separate them.
 *
 * @param record - The record to key.
 * @returns The exact amount as a string key.
 */
export function amountKey(record: NormalizedRecord): string {
  return record.amountMinor.toString();
}

/**
 * Selects source records that could together satisfy one ledger entry.
 *
 * Two strategies, in order:
 *
 * 1. **Reference prefix.** Instalments are commonly labelled by suffixing the
 *    parent reference (`ORD-4500-1`, `-2`, `-3`). Where that convention holds,
 *    it identifies the set precisely and regardless of how far apart in time
 *    the instalments fall.
 * 2. **Date window.** Where it does not, fall back to records near the ledger
 *    date and smaller than its amount.
 *
 * The fallback pool is capped: subset-sum is exponential in pool size, so an
 * unbounded search would blow the performance budget on a busy dataset. A pool
 * exceeding the cap is **skipped rather than truncated** — truncating would
 * silently search a subset of the data and could report a partial set that is
 * not the real one, which is a false match. Skipping merely misses it.
 *
 * @param ledgerEntry - The entry to satisfy.
 * @param availableSource - Source records still unmatched.
 * @param params - Thresholds for this run.
 * @returns Candidate records, or an empty array when no viable pool exists.
 *
 * @see docs/EVALUATION.md §6 — known limitations
 */
export function partialSetCandidates(
  ledgerEntry: NormalizedRecord,
  availableSource: readonly NormalizedRecord[],
  params: ReconParams,
): readonly NormalizedRecord[] {
  const target = absMinor(ledgerEntry.amountMinor);

  // Strategy 1: references sharing the ledger entry's prefix.
  if (ledgerEntry.normalizedRef.length > 0) {
    const byPrefix = availableSource.filter(
      (record) =>
        record.normalizedRef.length > ledgerEntry.normalizedRef.length &&
        record.normalizedRef.startsWith(ledgerEntry.normalizedRef) &&
        absMinor(record.amountMinor) < target,
    );
    if (byPrefix.length >= 2) return byPrefix;
  }

  // Strategy 2: nearby in time and individually smaller than the target.
  const byWindow = availableSource.filter(
    (record) =>
      absMinor(record.amountMinor) < target &&
      Math.abs(daysBetween(ledgerEntry.date, record.date)) <= params.partialSetWindowDays,
  );

  if (byWindow.length > params.maxPartialCandidates) return [];
  return byWindow;
}

/**
 * Finds every combination of candidates summing exactly to the target.
 *
 * Exhaustive over combinations of size 2 up to `maxPartialSetSize`. Returns
 * *all* solutions rather than the first, because the caller must be able to
 * tell a unique answer from an ambiguous one — picking arbitrarily between two
 * equally valid sets would be a guess, and the engine does not guess.
 *
 * @param candidates - The pool to search.
 * @param target - The amount the set must sum to.
 * @param params - Thresholds for this run.
 * @returns Every qualifying combination, each as an array of records.
 */
export function findExactSubsets(
  candidates: readonly NormalizedRecord[],
  target: Minor,
  params: ReconParams,
): readonly (readonly NormalizedRecord[])[] {
  const solutions: (readonly NormalizedRecord[])[] = [];
  const maxSize = Math.min(params.maxPartialSetSize, candidates.length);

  /**
   * Depth-first walk over combinations, extending `chosen` with candidates at
   * or after `start` so each combination is visited exactly once.
   */
  const walk = (start: number, chosen: NormalizedRecord[]): void => {
    if (chosen.length >= 2 && sumMinor(chosen.map((record) => record.amountMinor)) === target) {
      solutions.push([...chosen]);
      // A superset of an exact-sum set cannot also sum to the target unless a
      // member is zero, so there is nothing to gain by extending further.
      return;
    }
    if (chosen.length >= maxSize) return;
    for (let index = start; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate === undefined) continue;
      chosen.push(candidate);
      walk(index + 1, chosen);
      chosen.pop();
    }
  };

  walk(0, []);
  return solutions;
}
