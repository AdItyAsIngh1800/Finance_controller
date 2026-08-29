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
import { scoreAgainstGroundTruth, type ReconScore } from '@/core/score';
import type { Domain, MatchTier } from '@/core/types';

/** A domain's scorecard, as rendered. */
export interface DomainScorecard {
  readonly domain: Domain;
  readonly score: ReconScore;
  readonly matchedCount: number;
  readonly sourceCount: number;
  readonly matchesByTier: Readonly<Record<MatchTier, number>>;
  readonly durationMs: number;
}

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

    return {
      domain: dataset.domain,
      score: scoreAgainstGroundTruth(result, dataset.manifest),
      matchedCount: result.stats.matchedCount,
      sourceCount: result.stats.sourceCount,
      matchesByTier: result.stats.matchesByTier,
      durationMs,
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
  'Validated on synthetic data only. This system has never seen a real bank statement, and every figure here is measured against data it generated itself. That tests whether the engine implements its own logic correctly — not whether the logic survives real-world mess.',
  'Planted discrepancies are cleanly typed. Real ones compound: a partial payment that is also late and also mis-keyed.',
  'Partial payments are matched across at most three records. A payment split four or more ways is missed rather than searched for, because subset-sum cost grows sharply with set size.',
  'Single currency per dataset. Cross-currency matching needs FX-rate-at-date and is out of scope.',
  'Extraction confidence is self-reported by the model. It is measurably informative on the documents tested, but a confidently wrong reading remains possible — the gate reduces that risk, it does not eliminate it.',
  'The agent answers only about persisted reconciliation results. It cannot compute a figure the engine did not, and it does not forecast.',
  'Tolerances are global, not per-counterparty. Real reconciliation often needs vendor-specific rules.',
] as const;
