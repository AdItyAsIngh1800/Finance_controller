/**
 * Matching thresholds.
 *
 * Every tolerance the engine applies is a named constant here rather than a
 * literal at its use site, for three reasons: the values are snapshotted into
 * each run so results stay explicable after a retune, they are surfaced
 * read-only in the dashboard because a threshold a user cannot see is a magic
 * number they cannot trust, and a single definition means the engine and the UI
 * can never disagree about what was applied.
 *
 * @see docs/DESIGN.md §S-5 — the matching parameters panel
 * @module
 */

import { toMinor } from '../money';
import type { ReconParams } from '../types';

/**
 * Default thresholds.
 *
 * The values encode a deliberate asymmetry: a false exception costs a reviewer
 * thirty seconds, whereas a false match silently hides the discrepancy this
 * system exists to catch. Where a bound could reasonably go either way, it is
 * set to the stricter option.
 *
 * @see docs/ARCHITECTURE.md §4 — asymmetric error handling
 */
export const DEFAULT_RECON_PARAMS: ReconParams = {
  /** Payouts commonly settle a day or two after the sale; beyond that is notable. */
  dateWindowDays: 3,
  /** 0.5%, absorbing rounding and minor fee drift without hiding real gaps. */
  amountToleranceBps: 50,
  /** ₹1.00 floor, so small amounts still get workable slack. */
  amountToleranceFloorMinor: toMinor(100n),
  /**
   * Roughly one character difference in an eight-character reference. Set high
   * because a loose reference match is the most likely route to a false match.
   */
  refSimilarityThreshold: 0.85,
  /**
   * Deliberate ceiling: a payment split four or more ways is missed rather than
   * searched for, because subset-sum cost grows sharply with set size.
   */
  maxPartialSetSize: 3,
  /** Fallback window when instalments share no reference prefix. */
  partialSetWindowDays: 10,
  /** Caps the exponential search; a larger pool is skipped, not searched. */
  maxPartialCandidates: 16,
};
