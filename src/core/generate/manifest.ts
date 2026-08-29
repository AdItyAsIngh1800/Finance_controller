/**
 * Ground-truth manifest types.
 *
 * The generator does not merely produce plausible data — it records exactly
 * which discrepancies it planted and which pairs it left clean. That record is
 * what turns "the engine produced some exceptions" into a measurable precision
 * and recall figure, and it is the only reason the evaluation page can answer
 * *"how do you know it's right?"* with a number.
 *
 * @see docs/EVALUATION.md §2 — ground-truth methodology
 * @module
 */

import type { Domain, ExceptionType, NormalizedRecord } from '../types';

/**
 * One discrepancy deliberately introduced into a dataset.
 *
 * Scoring compares the engine's output against these entries: a planted item
 * the engine did not report is a recall miss; an exception the engine reported
 * that corresponds to no planted item is a precision miss.
 */
export interface PlantedDiscrepancy {
  /** Stable identifier for this planted item, e.g. `'planted-timing-3'`. */
  readonly id: string;
  /** The exception category the engine is expected to raise. */
  readonly type: ExceptionType;
  /** Source-side records involved in the discrepancy. */
  readonly sourceRecordIds: readonly string[];
  /** Ledger-side records involved in the discrepancy. */
  readonly ledgerEntryIds: readonly string[];
  /**
   * Whether the records should still be paired despite the exception.
   *
   * `true` for advisory exceptions such as `TIMING_DIFFERENCE`, where the money
   * is accounted for and the pairing stands. `false` for blocking exceptions,
   * where the engine should refuse to pair.
   *
   * @see EXCEPTION_DISPOSITION in `../taxonomy`
   */
  readonly expectsMatch: boolean;
  /** Human-readable description of what was done and why. */
  readonly note: string;
}

/**
 * A source/ledger pair that was deliberately left correct.
 *
 * Any match the engine makes between records that are not paired here and not
 * covered by a planted item is a **false match** — the failure mode this system
 * exists to prevent, and the metric held at zero.
 *
 * @see docs/EVALUATION.md §3.3
 */
export interface CleanPair {
  readonly sourceRecordId: string;
  readonly ledgerEntryId: string;
}

/** The complete ground truth for one generated dataset. */
export interface GroundTruthManifest {
  /** Which domain this dataset represents. */
  readonly domain: Domain;
  /** Seed used to generate it; regenerating with this seed reproduces it exactly. */
  readonly seed: number;
  /** Number of clean pairs generated before any discrepancy was planted. */
  readonly basePairCount: number;
  /** Every discrepancy deliberately introduced. */
  readonly planted: readonly PlantedDiscrepancy[];
  /** Every pair left untouched, against which false matches are measured. */
  readonly cleanPairs: readonly CleanPair[];
}

/** A generated dataset together with the ground truth describing it. */
export interface GeneratedDataset {
  readonly domain: Domain;
  /** External records — what the processor or bank reports. */
  readonly source: readonly NormalizedRecord[];
  /** Internal records — what the ledger says should have happened. */
  readonly ledger: readonly NormalizedRecord[];
  /** What was planted and what was left clean. */
  readonly manifest: GroundTruthManifest;
}

/**
 * How many of each discrepancy type to plant.
 *
 * Counts are explicit rather than probabilistic so that a dataset's composition
 * is known before it is generated, and so scoring has a fixed denominator.
 */
export interface PlantCounts {
  readonly unmatchedSource: number;
  readonly unmatchedLedger: number;
  readonly amountMismatch: number;
  readonly timingDifference: number;
  readonly duplicateSuspected: number;
  readonly partialPayment: number;
  /** Settlement only; ignored by the bank generator. */
  readonly feeVariance: number;
}

/** Options controlling dataset generation. */
export interface GenerateOptions {
  /** Seed for the deterministic generator. */
  readonly seed: number;
  /** Number of clean pairs to create before planting discrepancies. */
  readonly pairCount: number;
  /** How many of each discrepancy to plant. */
  readonly plant: PlantCounts;
  /** First transaction date; subsequent records fall within a six-week window. */
  readonly startDate: string;
}
