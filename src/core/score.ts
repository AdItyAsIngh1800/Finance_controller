/**
 * Scores engine output against ground truth.
 *
 * Lives in the core rather than in a test file because two callers need it: the
 * engine's own test suite, and the `/evaluation` page that reports these
 * figures in-product. A metric computed one way for the tests and another way
 * for the UI would be worse than no metric at all.
 *
 * @see docs/EVALUATION.md §3 — metrics
 * @module
 */

import type { GroundTruthManifest } from './generate/manifest';
import { EXCEPTION_TYPES } from './taxonomy';
import type { ExceptionType, ReconResult } from './types';

/** Precision and recall for one exception category. */
export interface TypeScore {
  readonly type: ExceptionType;
  /** How many of this type the generator planted. */
  readonly planted: number;
  /** How many the engine reported. */
  readonly reported: number;
  /** How many reported items correspond to a planted one. */
  readonly correct: number;
  /** `correct / reported`, or `1` when nothing was reported and nothing planted. */
  readonly precision: number;
  /** `correct / planted`, or `1` when nothing was planted. */
  readonly recall: number;
}

/** A pairing the engine made that ground truth says should not exist. */
export interface FalseMatch {
  readonly sourceRecordId: string;
  readonly ledgerEntryId: string;
  readonly tier: string;
}

/** The complete scorecard for one reconciliation run. */
export interface ReconScore {
  readonly byType: readonly TypeScore[];
  /**
   * Pairings ground truth says are wrong.
   *
   * The primary metric, held at zero. A false exception costs a reviewer thirty
   * seconds; a false match silently conceals a real discrepancy.
   *
   * @see docs/EVALUATION.md §3.3
   */
  readonly falseMatches: readonly FalseMatch[];
  /** Headline match rate — reported for context, not as a correctness measure. */
  readonly matchRate: number;
  /** Lowest recall across all types that had anything planted. */
  readonly minRecall: number;
  /** Lowest precision across all types that reported anything. */
  readonly minPrecision: number;
}

/** Do two id lists share at least one member? */
function overlaps(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

/**
 * Scores a reconciliation result against the manifest that describes its input.
 *
 * A reported exception counts as correct when it names the same category as a
 * planted discrepancy *and* involves at least one of the same records. Identity
 * is deliberately by overlap rather than exact set equality: the engine may
 * legitimately describe a discrepancy in terms of slightly different records
 * than the generator did — a duplicate reported from the ledger side rather
 * than the source side, for instance — without being wrong.
 *
 * @param result - Engine output.
 * @param manifest - Ground truth for the same dataset.
 * @returns Per-type precision and recall, plus any false matches.
 */
export function scoreAgainstGroundTruth(
  result: ReconResult,
  manifest: GroundTruthManifest,
): ReconScore {
  const byType: TypeScore[] = [];

  for (const type of EXCEPTION_TYPES) {
    const planted = manifest.planted.filter((item) => item.type === type);
    const reported = result.exceptions.filter((exception) => exception.type === type);

    // Recall: planted items the engine found.
    const foundPlanted = planted.filter((item) =>
      reported.some(
        (exception) =>
          overlaps(exception.sourceRecordIds, item.sourceRecordIds) ||
          overlaps(exception.ledgerEntryIds, item.ledgerEntryIds),
      ),
    );

    // Precision: reported items that correspond to something planted.
    const justifiedReports = reported.filter((exception) =>
      planted.some(
        (item) =>
          overlaps(exception.sourceRecordIds, item.sourceRecordIds) ||
          overlaps(exception.ledgerEntryIds, item.ledgerEntryIds),
      ),
    );

    byType.push({
      type,
      planted: planted.length,
      reported: reported.length,
      correct: foundPlanted.length,
      precision: reported.length === 0 ? 1 : justifiedReports.length / reported.length,
      recall: planted.length === 0 ? 1 : foundPlanted.length / planted.length,
    });
  }

  // A pairing is legitimate if ground truth left it clean, or planted it as an
  // advisory discrepancy where the records should still pair up.
  const allowed = new Set<string>();
  for (const pair of manifest.cleanPairs) {
    allowed.add(`${pair.sourceRecordId}|${pair.ledgerEntryId}`);
  }
  for (const item of manifest.planted) {
    if (!item.expectsMatch) continue;
    for (const sourceId of item.sourceRecordIds) {
      for (const ledgerId of item.ledgerEntryIds) allowed.add(`${sourceId}|${ledgerId}`);
    }
  }

  const falseMatches: FalseMatch[] = [];
  for (const match of result.matches) {
    for (const sourceRecordId of match.sourceRecordIds) {
      for (const ledgerEntryId of match.ledgerEntryIds) {
        if (allowed.has(`${sourceRecordId}|${ledgerEntryId}`)) continue;
        falseMatches.push({ sourceRecordId, ledgerEntryId, tier: match.tier });
      }
    }
  }

  const scoredRecall = byType.filter((score) => score.planted > 0).map((score) => score.recall);
  const scoredPrecision = byType
    .filter((score) => score.reported > 0)
    .map((score) => score.precision);

  return {
    byType,
    falseMatches,
    matchRate: result.stats.matchRate,
    minRecall: scoredRecall.length === 0 ? 1 : Math.min(...scoredRecall),
    minPrecision: scoredPrecision.length === 0 ? 1 : Math.min(...scoredPrecision),
  };
}
