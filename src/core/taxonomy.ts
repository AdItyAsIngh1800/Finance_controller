/**
 * The frozen exception taxonomy and match-tier vocabulary.
 *
 * This module is the single source of truth for the words the engine, the
 * database, the UI, and the Q&A agent all use to describe a reconciliation
 * finding. Adding or renaming a member here is a breaking change that must be
 * reflected in the Postgres enums, the exception queue UI, and the agent's
 * function results simultaneously.
 *
 * Const objects plus derived union types are used in preference to TypeScript
 * `enum`, which emits runtime code incompatible with `isolatedModules` and
 * cannot be narrowed as cleanly at usage sites.
 *
 * @see docs/DATA_MODEL.md §3 — enumerations, and §3.4 for the frozen taxonomy
 * @module
 */

/**
 * The two reconciliation domains supported against the shared engine.
 *
 * - `settlement` — marketplace / payment-processor payouts (primary)
 * - `bank` — bank statement lines against general-ledger entries (secondary)
 */
export const DOMAINS = ['settlement', 'bank'] as const;
export type Domain = (typeof DOMAINS)[number];

/**
 * Which side of a reconciliation a record belongs to.
 *
 * - `source` — the external record: what the processor or bank says happened
 * - `ledger` — the internal record: what the business says should have happened
 */
export const RECORD_SIDES = ['source', 'ledger'] as const;
export type RecordSide = (typeof RECORD_SIDES)[number];

/**
 * How a match was established, ordered from strongest to weakest evidence.
 *
 * The engine attempts tiers in this order and each tier considers only the
 * residue left by its predecessors, so a high-confidence match can never be
 * displaced by a speculative one. The tier is persisted with every match, which
 * is what allows the Q&A agent to explain *how* two records were paired.
 *
 * @see docs/ARCHITECTURE.md §4 — the reconciliation engine
 */
export const MATCH_TIERS = [
  /** Normalized reference equal **and** amount equal. */
  'EXACT_REF',
  /** Amount equal, transaction dates within the configured window. */
  'EXACT_AMOUNT_DATE',
  /** Reference similarity above threshold, amount within tolerance. */
  'FUZZY_REF',
  /** A bounded subset of source records sums to one ledger entry. */
  'PARTIAL_SET',
] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

/**
 * Rank of a match tier, `0` being the strongest evidence.
 *
 * Used to order tier execution and to sort matches for display.
 */
export const MATCH_TIER_RANK: Readonly<Record<MatchTier, number>> = {
  EXACT_REF: 0,
  EXACT_AMOUNT_DATE: 1,
  FUZZY_REF: 2,
  PARTIAL_SET: 3,
} as const;

/**
 * The frozen exception taxonomy.
 *
 * Every finding the engine emits carries exactly one of these categories. Free
 * text is confined to the accompanying `statedReason`; the category itself is
 * closed so that the UI can group, the database can constrain, and the agent
 * can reason over a known vocabulary.
 *
 * @see docs/DATA_MODEL.md §3.4
 */
export const EXCEPTION_TYPES = [
  /** External record with no ledger counterpart. */
  'UNMATCHED_SOURCE',
  /** Ledger entry the external source never confirmed. */
  'UNMATCHED_LEDGER',
  /** Counterpart found, but the amount differs beyond tolerance. */
  'AMOUNT_MISMATCH',
  /** Counterpart found, but the date differs beyond the window. */
  'TIMING_DIFFERENCE',
  /** More than one viable counterpart; the engine refuses to guess. */
  'DUPLICATE_SUSPECTED',
  /** A ledger amount satisfied by several smaller source records. */
  'PARTIAL_PAYMENT',
  /** Settlement only: `net ≠ gross − fees − refunds − chargebacks`. */
  'FEE_VARIANCE',
  /** Stage 1 extraction confidence below threshold; quarantined before the ledger. */
  'LOW_CONFIDENCE_EXTRACTION',
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

/**
 * How urgently a finding needs human attention.
 *
 * - `high` — money is unaccounted for
 * - `medium` — a human decision is required
 * - `low` — the discrepancy is *explained*; the money is accounted for, it
 *   simply moved on a different day or in several pieces
 */
export const SEVERITIES = ['high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Severity assigned to each exception type.
 *
 * The high/low split is what makes the exception queue usable rather than
 * merely long: a two-day timing difference and a missing payout are both
 * "exceptions", but treating them as equally alarming would turn the queue into
 * noise. Timing differences and partial payments are `low` precisely because
 * the money is fully accounted for.
 */
export const EXCEPTION_SEVERITY: Readonly<Record<ExceptionType, Severity>> = {
  UNMATCHED_SOURCE: 'high',
  UNMATCHED_LEDGER: 'high',
  AMOUNT_MISMATCH: 'high',
  TIMING_DIFFERENCE: 'low',
  DUPLICATE_SUSPECTED: 'medium',
  PARTIAL_PAYMENT: 'low',
  FEE_VARIANCE: 'high',
  LOW_CONFIDENCE_EXTRACTION: 'medium',
} as const;

/**
 * Sort weight for severities, ascending — `high` sorts first.
 *
 * The exception queue orders by severity, then by amount, so the largest
 * unexplained gaps surface at the top.
 */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  high: 0,
  medium: 1,
  low: 2,
} as const;

/**
 * Exception types that only apply to a specific domain.
 *
 * `FEE_VARIANCE` depends on the gross/fees/refunds/chargebacks identity, which
 * exists only in settlement data. The bank adapter must never produce it.
 *
 * @see docs/REQUIREMENTS.md FR-8.4 — settlement-only checks suppressed in bank mode
 */
export const DOMAIN_SPECIFIC_EXCEPTIONS: Readonly<Partial<Record<ExceptionType, Domain>>> = {
  FEE_VARIANCE: 'settlement',
} as const;

/**
 * Reports whether an exception type may be raised for a given domain.
 *
 * @param type - The exception category under consideration.
 * @param domain - The domain of the dataset being reconciled.
 * @returns `true` if the type is valid for the domain.
 *
 * @example
 * isExceptionValidForDomain('FEE_VARIANCE', 'bank');       // false
 * isExceptionValidForDomain('UNMATCHED_SOURCE', 'bank');   // true
 */
export function isExceptionValidForDomain(type: ExceptionType, domain: Domain): boolean {
  const restrictedTo = DOMAIN_SPECIFIC_EXCEPTIONS[type];
  return restrictedTo === undefined || restrictedTo === domain;
}

/**
 * Returns the severity for an exception type.
 *
 * Prefer this over indexing {@link EXCEPTION_SEVERITY} directly so that the
 * mapping stays a single point of change.
 *
 * @param type - The exception category.
 * @returns The severity assigned to that category.
 */
export function severityOf(type: ExceptionType): Severity {
  return EXCEPTION_SEVERITY[type];
}

/**
 * Type guard for {@link ExceptionType}.
 *
 * Used when reading values that originate outside the type system — database
 * rows, API payloads, or fixture manifests.
 *
 * @param value - An unknown value.
 * @returns `true` if the value is a member of the frozen taxonomy.
 */
export function isExceptionType(value: unknown): value is ExceptionType {
  return typeof value === 'string' && (EXCEPTION_TYPES as readonly string[]).includes(value);
}

/**
 * Type guard for {@link Domain}.
 *
 * @param value - An unknown value.
 * @returns `true` if the value is a supported domain.
 */
export function isDomain(value: unknown): value is Domain {
  return typeof value === 'string' && (DOMAINS as readonly string[]).includes(value);
}
