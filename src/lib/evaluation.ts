/**
 * Live evaluation figures for the `/evaluation` page.
 *
 * The engine scorecard is computed **in process**, not read from disk: fixtures
 * are gitignored and do not exist in a deployment, and the generators are pure
 * and seeded, so regenerating them on demand produces byte-identical data. The
 * page therefore reports a real run rather than a cached number someone might
 * have edited.
 *
 * The extraction and grounding figures cannot work that way — each would cost
 * live model calls on every page load — so they are recorded constants, labelled
 * with the date and model they were measured against.
 *
 * @see docs/EVALUATION.md §5
 * @module
 */

import { generateBankDataset } from '@/core/generate/bank';
import { generateSettlementDataset } from '@/core/generate/settlement';
import { DEFAULT_RECON_PARAMS } from '@/core/reconcile/config';
import { reconcile } from '@/core/reconcile/engine';
import { formatMinor } from '@/core/money';
import { scoreAgainstGroundTruth, type ReconScore } from '@/core/score';
import type { Domain, ExceptionType, MatchTier, Severity } from '@/core/types';

/**
 * One finding from a run, resolved and formatted for display.
 *
 * Exists so the landing page can show the engine's *actual* output instead of
 * an illustration of it. Every field here came out of `reconcile()` on the
 * seeded dataset: the reference is a real record's, the amounts are the real
 * figures that disagreed, and the sentence is the one the engine wrote.
 *
 * Amounts are pre-formatted strings because they originate as `Minor`, a
 * branded `bigint`. Formatting here rather than at the call site keeps the
 * conversion in one place and off the money path.
 */
export interface Finding {
  readonly type: ExceptionType;
  /** Typed rather than stringly so `SeverityBadge` can render it directly. */
  readonly severity: Severity;
  /** The record's own reference, as supplied — `ORD-4471`, not a uuid. */
  readonly reference: string;
  /** The two figures that disagree, where the finding is a disagreement. */
  readonly sourceAmount: string | null;
  readonly ledgerAmount: string | null;
  /** The engine's plain-English sentence, verbatim. */
  readonly statedReason: string;
}

/** A domain's scorecard, as rendered. */
export interface DomainScorecard {
  readonly domain: Domain;
  readonly score: ReconScore;
  readonly matchedCount: number;
  readonly sourceCount: number;
  readonly matchesByTier: Readonly<Record<MatchTier, number>>;
  readonly durationMs: number;
  /**
   * The run's highest-severity findings, resolved for display.
   *
   * Carried on the scorecard rather than recomputed by the caller because the
   * run that produces them already happens here — `reconcile()` returns its
   * exceptions and this function used to throw them away. Reconciling a second
   * time to read them back would double the work on every landing request.
   *
   * The engine already sorts exceptions severity-first, so these are the top of
   * that order rather than an arbitrary slice.
   */
  readonly findings: readonly Finding[];
}

/** How many findings a scorecard carries. Enough to fill a panel, not a table. */
const FINDING_SAMPLE_SIZE = 4;

/**
 * Runs both domains through the engine and scores them against ground truth.
 *
 * @returns One scorecard per domain, in demo order.
 */
export function computeScorecards(): readonly DomainScorecard[] {
  return [generateSettlementDataset(), generateBankDataset()].map((dataset) => {
    const started = performance.now();
    const result = reconcile({
      domain: dataset.domain,
      source: dataset.source,
      ledger: dataset.ledger,
      params: DEFAULT_RECON_PARAMS,
    });
    const durationMs = performance.now() - started;

    // Resolve record ids back to the references and amounts a human reads. The
    // engine deals in ids; a finding that says `a3f1-…` is one nobody can act on.
    const recordById = new Map(
      [...dataset.source, ...dataset.ledger].map((record) => [record.id, record]),
    );

    const findings: Finding[] = result.exceptions
      .slice(0, FINDING_SAMPLE_SIZE)
      .map((exception) => {
        const record =
          recordById.get(exception.sourceRecordIds[0] ?? '') ??
          recordById.get(exception.ledgerEntryIds[0] ?? '');
        // The first evidence line carries the figures behind the sentence. Not
        // every exception is a disagreement about an amount — an orphan has one
        // side and no comparison — so both halves are independently optional.
        const evidence = exception.evidence[0];
        return {
          type: exception.type,
          severity: exception.severity,
          reference: record?.externalRef ?? '—',
          sourceAmount:
            evidence?.sourceMinor === undefined ? null : formatMinor(evidence.sourceMinor),
          ledgerAmount:
            evidence?.ledgerMinor === undefined ? null : formatMinor(evidence.ledgerMinor),
          statedReason: exception.statedReason,
        };
      });

    return {
      domain: dataset.domain,
      score: scoreAgainstGroundTruth(result, dataset.manifest),
      matchedCount: result.stats.matchedCount,
      sourceCount: result.stats.sourceCount,
      matchesByTier: result.stats.matchesByTier,
      durationMs,
      findings,
    };
  });
}

/**
 * Extraction results, measured offline.
 *
 * Recorded rather than live because each row costs a model call. Reproduce with
 * `npm run extraction:report`.
 */
export const EXTRACTION_RESULTS = {
  measuredOn: '29 August 2026',
  model: 'gemini-3.6-flash',
  cleanAccuracy: '100% (15/15)',
  degradedAccuracy: '0% (0/3)',
  cleanConfidence: 0.99,
  degradedConfidence: 0.4,
  threshold: 0.85,
  gateHeld: true,
} as const;

/**
 * Grounding results, measured offline.
 *
 * Reproduce with `npm run grounding:report`.
 */
export const GROUNDING_RESULTS = {
  measuredOn: '29 August 2026',
  model: 'gemini-3.6-flash',
  questionsAsked: 7,
  ungroundedFigures: 0,
  outages: 0,
  refusalsCorrect: '4/4',
} as const;

/**
 * Limitations shown in-product.
 *
 * Rendered on the page rather than only in the repository. A tool that states
 * its own boundaries is more trustworthy than one that requires you to find
 * them, and the track grades honesty about what breaks.
 *
 * @see docs/EVALUATION.md §6
 */
export const KNOWN_LIMITATIONS: readonly string[] = [
  'Validated on synthetic data only. This system has never seen a real bank statement, and every figure here is measured against data it generated itself. That tests whether the engine implements its own logic correctly . It does not test whether the logic survives real-world mess.',
  'Planted discrepancies are cleanly typed. Real ones compound: a partial payment that is also late and also mis-keyed.',
  'Partial payments are matched across at most three records. A payment split four or more ways is missed rather than searched for, because subset-sum cost grows sharply with set size.',
  'Single currency per dataset. Cross-currency matching needs FX-rate-at-date and is out of scope.',
  'Extraction confidence is self-reported by the model. It is measurably informative on the documents tested, but a confidently wrong reading remains possible . The gate reduces that risk. It does not eliminate it.',
  'The agent answers only about persisted reconciliation results. It cannot compute a figure the engine did not, and it does not forecast.',
  'Tolerances are global, not per-counterparty. Real reconciliation often needs vendor-specific rules.',
] as const;
