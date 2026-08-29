/**
 * The adapter contract.
 *
 * An adapter turns one domain's file format into {@link NormalizedRecord}s the
 * engine understands. It is where every domain-specific quirk lives — column
 * names, sign conventions, fee itemisation — so that the engine below can stay
 * domain-agnostic.
 *
 * @see docs/ARCHITECTURE.md §3 — the adapter pattern
 * @module
 */

import type { NormalizedRecord, RecordSide } from '../types';

/** A row that could not be converted, and why. */
export interface RowError {
  /** Physical line in the uploaded file, so the user can find it. */
  readonly lineNumber: number;
  /** The column at fault, where the failure is attributable to one. */
  readonly column?: string;
  /** Plain-English explanation. */
  readonly reason: string;
}

/**
 * The outcome of parsing one file.
 *
 * Records and errors are returned together rather than throwing on the first
 * failure, so a user with three bad rows learns about all three at once instead
 * of fixing them one upload at a time.
 *
 * Note that the *caller* decides what to do with a partial result. Ingestion
 * rejects the whole file if `errors` is non-empty: a ledger missing rows
 * reconciles into a pile of spurious unmatched exceptions that look exactly like
 * real findings.
 */
export interface AdapterResult {
  readonly records: readonly NormalizedRecord[];
  readonly errors: readonly RowError[];
}

/** Parses one side of one domain's file format. */
export type Adapter = (text: string, side: RecordSide) => AdapterResult;
