/**
 * The domain model shared by every stage of the pipeline.
 *
 * These types are the contract that lets one reconciliation engine serve two
 * domains: adapters convert domain-specific input into {@link NormalizedRecord},
 * and the engine reasons only about that shape. Domain-specific data survives
 * the normalization in the {@link NormalizedRecord.detail} payload, where the
 * engine ignores it and the UI and agent can still read it.
 *
 * **This module, and everything else under `src/core/`, imports nothing** — no
 * database client, no AI SDK, no framework. That constraint is what makes the
 * engine testable without mocks and reusable across domains.
 *
 * @see docs/ARCHITECTURE.md §3 — the adapter pattern
 * @see docs/DATA_MODEL.md §4 — the corresponding database schema
 * @module
 */

import type { Minor } from './money';
import type { Domain, ExceptionType, MatchTier, RecordSide, Severity } from './taxonomy';

/**
 * A calendar date in `YYYY-MM-DD` form.
 *
 * Deliberately a date, not an instant. Settlement and ledger dates are calendar
 * facts; storing them as timestamps invites timezone shifts that manufacture
 * phantom `TIMING_DIFFERENCE` exceptions out of nothing.
 *
 * @see docs/DATA_MODEL.md §1
 */
export type IsoDate = string;

/**
 * A record from either side of a reconciliation, in the shape the engine
 * understands.
 *
 * Produced by a domain adapter from a CSV row or a promoted extraction. Both
 * the external source and the internal ledger use this same shape — the `side`
 * distinguishes them.
 */
export interface NormalizedRecord {
  /** Stable identifier, unique within a dataset. */
  readonly id: string;
  /** Which side of the reconciliation this record belongs to. */
  readonly side: RecordSide;
  /** The reference exactly as supplied by the source, retained for display. */
  readonly externalRef: string;
  /**
   * The reference reduced to a comparable form — uppercased, punctuation and
   * whitespace stripped. This, not {@link externalRef}, is the matching key.
   */
  readonly normalizedRef: string;
  /** The transaction's calendar date. */
  readonly date: IsoDate;
  /**
   * Signed amount in minor units. Adapters normalize direction, so the engine
   * never reasons about debit/credit conventions: credits are positive,
   * debits negative.
   */
  readonly amountMinor: Minor;
  /** Free-text description or narration, for display and fuzzy context. */
  readonly description: string;
  /** Domain-specific payload the engine ignores. See {@link RecordDetail}. */
  readonly detail: RecordDetail;
}

/**
 * A single itemised fee within a settlement payout.
 *
 * The itemisation is what turns *"the payout was ₹412 short"* into *"₹250
 * platform commission plus ₹162 gateway fee"*. Without it the agent can only
 * restate the gap rather than explain it.
 */
export interface FeeLine {
  /** Human-readable fee name, e.g. `'Platform commission'`. */
  readonly label: string;
  /** The fee amount, as a positive value. */
  readonly amountMinor: Minor;
}

/**
 * Domain payload for settlement records.
 *
 * The engine verifies the identity
 * `net = gross − fees − refunds − chargebacks` and raises `FEE_VARIANCE` when
 * it does not hold. That check is pure arithmetic, and is the clearest
 * demonstration that reconciliation needs no model.
 */
export interface SettlementDetail {
  readonly kind: 'settlement';
  /** Total sale value before any deduction. */
  readonly grossMinor: Minor;
  /** Total of all fee lines. */
  readonly feesMinor: Minor;
  /** Refunds netted out of this payout. */
  readonly refundsMinor: Minor;
  /** Chargebacks netted out of this payout. */
  readonly chargebacksMinor: Minor;
  /** Amount actually paid out. */
  readonly netMinor: Minor;
  /** Itemised breakdown of {@link feesMinor}. */
  readonly feeLines: readonly FeeLine[];
}

/**
 * Domain payload for bank-statement records.
 *
 * `direction` is retained for display only. The adapter has already folded it
 * into the sign of {@link NormalizedRecord.amountMinor}, so the engine never
 * consults it.
 */
export interface BankDetail {
  readonly kind: 'bank';
  /** Raw narration text as printed on the statement. */
  readonly narration: string;
  /** Direction as stated by the bank, before sign normalization. */
  readonly direction: 'credit' | 'debit';
  /** Running account balance after this line, where the statement provides it. */
  readonly balanceMinor?: Minor;
  /** Unique Transaction Reference, where present. */
  readonly utr?: string;
}

/**
 * Discriminated union of domain payloads.
 *
 * Narrow on `detail.kind` to access domain-specific fields safely.
 */
export type RecordDetail = SettlementDetail | BankDetail;

/**
 * A pairing the engine established between source and ledger records.
 *
 * Both sides are arrays to accommodate `PARTIAL_SET`, where several source
 * records together satisfy one ledger entry.
 */
export interface Match {
  /** Source-side records participating in this match. */
  readonly sourceRecordIds: readonly string[];
  /** Ledger-side records participating in this match. */
  readonly ledgerEntryIds: readonly string[];
  /** Which tier established the match — the basis for explaining it. */
  readonly tier: MatchTier;
  /** Signed difference between the two sides; zero for an exact match. */
  readonly amountDeltaMinor: Minor;
  /** Signed difference in days between the two sides; zero when same-day. */
  readonly dayDelta: number;
  /** Engine-generated plain-English account of why these records were paired. */
  readonly rationale: string;
}

/**
 * One line of evidence behind an exception.
 *
 * Structured deliberately so that the Q&A agent can *quote* figures rather than
 * re-derive them, and so the UI can render a side-by-side comparison with the
 * differing line marked. An agent that reports is trustworthy; an agent that
 * computes is not.
 *
 * @see docs/DESIGN.md §S-6 — exception queue
 */
export interface EvidenceLine {
  /** What this line represents, e.g. `'Refunds'`. */
  readonly label: string;
  /** The figure according to the external source, where applicable. */
  readonly sourceMinor?: Minor;
  /** The figure according to the internal ledger, where applicable. */
  readonly ledgerMinor?: Minor;
  /** Optional annotation, e.g. `'not present in ledger'`. */
  readonly note?: string;
}

/**
 * A discrepancy the engine could not resolve, or an anomaly it detected.
 *
 * Named `ReconException` rather than `Exception` to keep it unambiguous
 * alongside thrown errors. Maps to the `exceptions` table.
 *
 * @see docs/DATA_MODEL.md §4.7
 */
export interface ReconException {
  /** Category from the frozen taxonomy. */
  readonly type: ExceptionType;
  /** Derived from {@link type}; carried explicitly for sorting and display. */
  readonly severity: Severity;
  /** Source-side records involved. May be empty. */
  readonly sourceRecordIds: readonly string[];
  /** Ledger-side records involved. May be empty. */
  readonly ledgerEntryIds: readonly string[];
  /**
   * A plain-English sentence explaining the finding.
   *
   * Never an error code and never a visibly templated string — this text is
   * read directly by a finance user.
   */
  readonly statedReason: string;
  /** The figures behind {@link statedReason}, for display and for the agent. */
  readonly evidence: readonly EvidenceLine[];
  /** Optional next step for the reviewer. */
  readonly suggestedAction?: string;
}

/**
 * Thresholds governing a reconciliation run.
 *
 * Snapshotted into every run so results stay explicable after the defaults are
 * retuned, and surfaced read-only in the UI — a tolerance a user cannot see is
 * a magic number they cannot trust.
 *
 * @see docs/DESIGN.md §S-5 — the matching parameters panel
 */
export interface ReconParams {
  /** Maximum absolute day difference tolerated by `EXACT_AMOUNT_DATE`. */
  readonly dateWindowDays: number;
  /** Proportional amount tolerance, in basis points. `50` is 0.5%. */
  readonly amountToleranceBps: number;
  /** Floor for the amount tolerance, so tiny amounts still get some slack. */
  readonly amountToleranceFloorMinor: Minor;
  /** Minimum normalized-reference similarity, in `[0,1]`, for `FUZZY_REF`. */
  readonly refSimilarityThreshold: number;
  /**
   * Largest number of source records the engine will combine when searching
   * for a `PARTIAL_SET`.
   *
   * A deliberate ceiling: subset-sum is exponential, and a payment split more
   * ways than this is missed rather than searched for.
   *
   * @see docs/EVALUATION.md §6 — known limitations
   */
  readonly maxPartialSetSize: number;
  /**
   * Maximum day difference between a ledger entry and a source record for that
   * record to be considered part of a partial set.
   *
   * Applied only to the date-window fallback; reference-prefix candidates are
   * accepted regardless of how far apart in time they fall.
   */
  readonly partialSetWindowDays: number;
  /**
   * Largest candidate pool the partial-set search will enumerate over.
   *
   * Subset-sum is exponential in the pool size, so this bound is what keeps the
   * tier inside the performance budget. A ledger entry whose date-window pool
   * exceeds this is skipped rather than searched.
   *
   * @see docs/EVALUATION.md §6 — known limitations
   */
  readonly maxPartialCandidates: number;
}

/** Everything the engine needs to reconcile one dataset. */
export interface ReconInput {
  /** Domain of the dataset, used to gate domain-specific checks. */
  readonly domain: Domain;
  /** External records. */
  readonly source: readonly NormalizedRecord[];
  /** Internal ledger entries. */
  readonly ledger: readonly NormalizedRecord[];
  /** Thresholds for this run. */
  readonly params: ReconParams;
}

/** Summary counters for a completed run. */
export interface ReconStats {
  readonly sourceCount: number;
  readonly ledgerCount: number;
  readonly matchedCount: number;
  readonly exceptionCount: number;
  /**
   * Matched source records as a fraction of all source records, in `[0,1]`.
   *
   * The headline figure, and explicitly **not** a correctness metric — an
   * engine that matched everything to anything would score `1`. Always read
   * alongside the per-type precision and recall in docs/EVALUATION.md §3.
   */
  readonly matchRate: number;
  /** Count of matches per tier, for the dashboard breakdown. */
  readonly matchesByTier: Readonly<Record<MatchTier, number>>;
  /** Count of exceptions per category. */
  readonly exceptionsByType: Readonly<Partial<Record<ExceptionType, number>>>;
}

/**
 * The complete result of a reconciliation run.
 *
 * The engine is a pure function from {@link ReconInput} to this value: given
 * identical input it returns byte-identical output, with no network, database,
 * or clock access anywhere in between.
 *
 * @see docs/REQUIREMENTS.md NFR-1.4 — determinism
 */
export interface ReconResult {
  readonly matches: readonly Match[];
  readonly exceptions: readonly ReconException[];
  readonly stats: ReconStats;
  /** The parameters actually used, echoed back for snapshotting. */
  readonly params: ReconParams;
}

export type { Domain, ExceptionType, MatchTier, RecordSide, Severity } from './taxonomy';
export type { Minor } from './money';
