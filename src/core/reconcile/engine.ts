/**
 * The reconciliation engine.
 *
 * A pure function from {@link ReconInput} to {@link ReconResult}: no database,
 * no network, no clock, and **no model**. Given identical input it returns
 * byte-identical output.
 *
 * That absence of AI is the project's central design position rather than an
 * unfinished piece. Comparing amounts and dates has exact answers; a model here
 * would trade determinism and auditability for nothing, and it is precisely
 * because these results are computed deterministically that the Q&A agent
 * explaining them can be trusted.
 *
 * **Matching is mutual-uniqueness only.** A pairing is accepted when exactly one
 * source and exactly one ledger record are candidates for each other. Where
 * several are viable, the engine reports `DUPLICATE_SUSPECTED` rather than
 * choosing — a false match silently hides the discrepancy this system exists to
 * catch, whereas a false exception costs a reviewer thirty seconds.
 *
 * @see docs/ARCHITECTURE.md §1 — AI trust boundaries
 * @see docs/ARCHITECTURE.md §4 — the reconciliation engine
 * @module
 */

import { daysBetween } from '../dates';
import { absMinor, formatMinor, subMinor, sumMinor, toMinor, type Minor } from '../money';
import { EXCEPTION_SEVERITY, SEVERITY_RANK } from '../taxonomy';
import type {
  EvidenceLine,
  ExceptionType,
  Match,
  MatchTier,
  NormalizedRecord,
  ReconException,
  ReconInput,
  ReconResult,
  ReconStats,
  SettlementDetail,
} from '../types';
import {
  amountKey,
  amountsAgree,
  datesAgree,
  exactRefKey,
  findExactSubsets,
  partialSetCandidates,
} from './tiers';
import { refSimilarity } from '../refs';

/** Records available to a tier, keyed by id, in input order. */
type Pool = Map<string, NormalizedRecord>;

/**
 * Groups records from both sides under a shared key.
 *
 * @param sources - Available source records.
 * @param ledgers - Available ledger records.
 * @param keyOf - Key function; records returning `null` are excluded.
 * @returns Groups in first-seen order, so iteration stays deterministic.
 */
function groupBySharedKey(
  sources: Pool,
  ledgers: Pool,
  keyOf: (record: NormalizedRecord) => string | null,
): Map<string, { sources: NormalizedRecord[]; ledgers: NormalizedRecord[] }> {
  const groups = new Map<string, { sources: NormalizedRecord[]; ledgers: NormalizedRecord[] }>();
  const ensure = (key: string) => {
    let group = groups.get(key);
    if (group === undefined) {
      group = { sources: [], ledgers: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const record of sources.values()) {
    const key = keyOf(record);
    if (key !== null) ensure(key).sources.push(record);
  }
  for (const record of ledgers.values()) {
    const key = keyOf(record);
    if (key !== null) ensure(key).ledgers.push(record);
  }
  return groups;
}

/** Builds one evidence line comparing an amount across both sides. */
function amountEvidence(source: Minor, ledger: Minor): EvidenceLine {
  const delta = subMinor(ledger, source);
  return {
    label: 'Amount',
    sourceMinor: source,
    ledgerMinor: ledger,
    note: delta === 0n ? undefined : `differs by ${formatMinor(absMinor(delta))}`,
  };
}

/**
 * Builds a side-by-side settlement breakdown.
 *
 * This is what turns *"the payout was ₹412 short"* into *"a ₹412 refund the
 * ledger never recorded"*: the agent quotes these lines rather than re-deriving
 * the arithmetic itself.
 */
function settlementEvidence(source: NormalizedRecord, ledger: NormalizedRecord): EvidenceLine[] {
  if (source.detail.kind !== 'settlement' || ledger.detail.kind !== 'settlement') {
    return [amountEvidence(source.amountMinor, ledger.amountMinor)];
  }
  const s = source.detail;
  const l = ledger.detail;
  const line = (label: string, a: Minor, b: Minor): EvidenceLine => ({
    label,
    sourceMinor: a,
    ledgerMinor: b,
    note: a === b ? undefined : 'differs',
  });
  return [
    line('Gross', s.grossMinor, l.grossMinor),
    line('Fees', s.feesMinor, l.feesMinor),
    line('Refunds', s.refundsMinor, l.refundsMinor),
    line('Chargebacks', s.chargebacksMinor, l.chargebacksMinor),
    line('Net', s.netMinor, l.netMinor),
  ];
}

/**
 * Explains an amount mismatch in plain English.
 *
 * Where the settlement breakdown identifies a single differing component, that
 * component is named. A reviewer can act on *"a ₹412.00 refund the ledger did
 * not record"*; they cannot act on *"the amounts differ"*.
 */
function explainMismatch(source: NormalizedRecord, ledger: NormalizedRecord): string {
  const gap = absMinor(subMinor(ledger.amountMinor, source.amountMinor));
  const generic =
    `${source.externalRef}: the source reports ${formatMinor(source.amountMinor)} but the ` +
    `ledger expects ${formatMinor(ledger.amountMinor)}, a difference of ${formatMinor(gap)}.`;

  if (source.detail.kind !== 'settlement' || ledger.detail.kind !== 'settlement') return generic;

  const refundGap = subMinor(source.detail.refundsMinor, ledger.detail.refundsMinor);
  if (refundGap !== 0n && absMinor(refundGap) === gap) {
    return (
      `${source.externalRef}: the processor netted a refund of ${formatMinor(absMinor(refundGap))} ` +
      `out of this payout that the ledger never recorded, leaving the two sides ` +
      `${formatMinor(gap)} apart.`
    );
  }

  const chargebackGap = subMinor(source.detail.chargebacksMinor, ledger.detail.chargebacksMinor);
  if (chargebackGap !== 0n && absMinor(chargebackGap) === gap) {
    return (
      `${source.externalRef}: a chargeback of ${formatMinor(absMinor(chargebackGap))} was deducted ` +
      `from this payout but is absent from the ledger.`
    );
  }

  const feeGap = subMinor(source.detail.feesMinor, ledger.detail.feesMinor);
  if (feeGap !== 0n && absMinor(feeGap) === gap) {
    return (
      `${source.externalRef}: the processor charged ${formatMinor(absMinor(feeGap))} more in fees ` +
      `than the ledger anticipated.`
    );
  }

  return generic;
}

/**
 * Reconciles one dataset.
 *
 * Tiers run strongest-evidence-first, each seeing only what its predecessors
 * left, so a speculative match can never displace a confident one.
 *
 * @param input - The two sides, the domain, and the thresholds to apply.
 * @returns Matches, exceptions, and summary statistics.
 *
 * @example
 * const result = reconcile({ domain: 'settlement', source, ledger, params });
 * result.stats.matchRate; // 0..1
 */
export function reconcile(input: ReconInput): ReconResult {
  const { params } = input;
  const availableSource: Pool = new Map(input.source.map((record) => [record.id, record]));
  const availableLedger: Pool = new Map(input.ledger.map((record) => [record.id, record]));

  const matches: Match[] = [];
  const exceptions: ReconException[] = [];
  const matchedSourceIds = new Set<string>();

  /** Removes records from circulation so no later tier can reconsider them. */
  const consume = (sourceIds: readonly string[], ledgerIds: readonly string[]): void => {
    for (const id of sourceIds) availableSource.delete(id);
    for (const id of ledgerIds) availableLedger.delete(id);
  };

  /** Records a match and marks its participants matched. */
  const addMatch = (
    sourceRecords: readonly NormalizedRecord[],
    ledgerRecords: readonly NormalizedRecord[],
    tier: MatchTier,
    rationale: string,
  ): void => {
    const sourceTotal = sumMinor(sourceRecords.map((record) => record.amountMinor));
    const ledgerTotal = sumMinor(ledgerRecords.map((record) => record.amountMinor));
    const firstSource = sourceRecords[0];
    const firstLedger = ledgerRecords[0];
    matches.push({
      sourceRecordIds: sourceRecords.map((record) => record.id),
      ledgerEntryIds: ledgerRecords.map((record) => record.id),
      tier,
      amountDeltaMinor: subMinor(ledgerTotal, sourceTotal),
      dayDelta:
        firstSource !== undefined && firstLedger !== undefined
          ? daysBetween(firstLedger.date, firstSource.date)
          : 0,
      rationale,
    });
    for (const record of sourceRecords) matchedSourceIds.add(record.id);
    consume(
      sourceRecords.map((record) => record.id),
      ledgerRecords.map((record) => record.id),
    );
  };

  /** Records an exception, deriving severity from the frozen taxonomy. */
  const addException = (
    type: ExceptionType,
    sourceRecordIds: readonly string[],
    ledgerEntryIds: readonly string[],
    statedReason: string,
    evidence: readonly EvidenceLine[],
    suggestedAction?: string,
  ): void => {
    exceptions.push({
      type,
      severity: EXCEPTION_SEVERITY[type],
      sourceRecordIds,
      ledgerEntryIds,
      statedReason,
      evidence,
      ...(suggestedAction === undefined ? {} : { suggestedAction }),
    });
  };

  /**
   * Runs one keyed tier.
   *
   * Within each key group, a pairing is accepted only when the two records are
   * each other's sole candidate. Contested groups become `DUPLICATE_SUSPECTED`
   * and their records are consumed, so an ambiguity is reported once rather
   * than resurfacing later as a pair of spurious unmatched records.
   */
  const runKeyedTier = (
    tier: MatchTier,
    keyOf: (record: NormalizedRecord) => string | null,
    isViable: (source: NormalizedRecord, ledger: NormalizedRecord) => boolean,
    describe: (source: NormalizedRecord, ledger: NormalizedRecord) => string,
  ): void => {
    for (const group of groupBySharedKey(availableSource, availableLedger, keyOf).values()) {
      const sources = group.sources.filter((record) => availableSource.has(record.id));
      const ledgers = group.ledgers.filter((record) => availableLedger.has(record.id));
      if (sources.length === 0 || ledgers.length === 0) continue;

      const viableFor = new Map<string, NormalizedRecord[]>();
      for (const source of sources) {
        viableFor.set(
          source.id,
          ledgers.filter((ledger) => isViable(source, ledger)),
        );
      }

      for (const source of sources) {
        if (!availableSource.has(source.id)) continue;
        const candidates = (viableFor.get(source.id) ?? []).filter((ledger) =>
          availableLedger.has(ledger.id),
        );
        if (candidates.length === 0) continue;

        const ledger = candidates[0];
        if (ledger === undefined) continue;

        // Contested from the source side: several ledger entries are viable.
        if (candidates.length > 1) {
          addException(
            'DUPLICATE_SUSPECTED',
            [source.id],
            candidates.map((entry) => entry.id),
            `${source.externalRef} could correspond to ${candidates.length} different ledger ` +
              `entries; none can be chosen over the others.`,
            candidates.map((entry) => amountEvidence(source.amountMinor, entry.amountMinor)),
            'Confirm which ledger entry this record belongs to.',
          );
          consume(
            [source.id],
            candidates.map((entry) => entry.id),
          );
          continue;
        }

        // Contested from the ledger side: several source records are viable.
        const contenders = sources.filter(
          (other) =>
            availableSource.has(other.id) &&
            (viableFor.get(other.id) ?? []).some((entry) => entry.id === ledger.id),
        );
        if (contenders.length > 1) {
          addException(
            'DUPLICATE_SUSPECTED',
            contenders.map((record) => record.id),
            [ledger.id],
            `${ledger.externalRef} has ${contenders.length} possible source records; ` +
              `neither copy can be chosen over the other.`,
            contenders.map((record) => amountEvidence(record.amountMinor, ledger.amountMinor)),
            'Confirm whether this transaction was recorded twice.',
          );
          consume(
            contenders.map((record) => record.id),
            [ledger.id],
          );
          continue;
        }

        addMatch([source], [ledger], tier, describe(source, ledger));
      }
    }
  };

  // --- Tier 1: exact reference and exact amount ---------------------------
  // Dates are deliberately not consulted. A payout that settled late still
  // reconciles; lateness is reported afterwards as an advisory.
  runKeyedTier(
    'EXACT_REF',
    exactRefKey,
    () => true,
    (source) => `Reference ${source.externalRef} and amount match exactly.`,
  );

  // --- Tier 2: exact amount within the date window ------------------------
  runKeyedTier(
    'EXACT_AMOUNT_DATE',
    amountKey,
    (source, ledger) => datesAgree(source.date, ledger.date, params),
    (source, ledger) =>
      `Amounts match exactly and the dates are ${Math.abs(
        daysBetween(ledger.date, source.date),
      )} day(s) apart, inside the ±${params.dateWindowDays} day window.`,
  );

  // --- Tier 3: fuzzy reference within amount tolerance --------------------
  // No exact key exists, so this compares remaining records pairwise. The pool
  // is small by this point because the exact tiers have already claimed most of
  // it.
  for (const source of [...availableSource.values()]) {
    if (!availableSource.has(source.id)) continue;
    const scored = [...availableLedger.values()]
      .filter(
        (ledger) =>
          amountsAgree(source.amountMinor, ledger.amountMinor, params) &&
          refSimilarity(source.normalizedRef, ledger.normalizedRef) >=
            params.refSimilarityThreshold,
      )
      .map((ledger) => ({
        ledger,
        similarity: refSimilarity(source.normalizedRef, ledger.normalizedRef),
      }));

    if (scored.length === 0) continue;
    if (scored.length > 1) {
      addException(
        'DUPLICATE_SUSPECTED',
        [source.id],
        scored.map((entry) => entry.ledger.id),
        `${source.externalRef} resembles ${scored.length} ledger references equally well; ` +
          `none can be chosen over the others.`,
        scored.map((entry) => amountEvidence(source.amountMinor, entry.ledger.amountMinor)),
        'Confirm which ledger entry this record belongs to.',
      );
      consume(
        [source.id],
        scored.map((entry) => entry.ledger.id),
      );
      continue;
    }

    const best = scored[0];
    if (best === undefined) continue;
    addMatch(
      [source],
      [best.ledger],
      'FUZZY_REF',
      `Reference ${source.externalRef} resembles ${best.ledger.externalRef} ` +
        `(${(best.similarity * 100).toFixed(0)}% similar) and the amounts agree within tolerance.`,
    );
  }

  // --- Tier 4: bounded partial sets ---------------------------------------
  for (const ledger of [...availableLedger.values()]) {
    if (!availableLedger.has(ledger.id)) continue;
    const candidates = partialSetCandidates(ledger, [...availableSource.values()], params);
    if (candidates.length < 2) continue;

    const subsets = findExactSubsets(candidates, ledger.amountMinor, params);
    if (subsets.length === 0) continue;

    // Several distinct sets summing to the same target is an ambiguity, not a
    // menu to choose from.
    if (subsets.length > 1) {
      const involved = [...new Set(subsets.flat().map((record) => record.id))];
      addException(
        'DUPLICATE_SUSPECTED',
        involved,
        [ledger.id],
        `${ledger.externalRef} can be satisfied by ${subsets.length} different combinations of ` +
          `source records; none can be chosen over the others.`,
        [amountEvidence(toMinor(0n), ledger.amountMinor)],
        'Confirm which records make up this payment.',
      );
      consume(involved, [ledger.id]);
      continue;
    }

    const set = subsets[0];
    if (set === undefined || set.length < 2) continue;
    addMatch(
      set,
      [ledger],
      'PARTIAL_SET',
      `${set.length} source records together total ${formatMinor(ledger.amountMinor)}, ` +
        `matching this ledger entry exactly.`,
    );
    addException(
      'PARTIAL_PAYMENT',
      set.map((record) => record.id),
      [ledger.id],
      `${ledger.externalRef} was satisfied by ${set.length} separate payments totalling ` +
        `${formatMinor(ledger.amountMinor)}.`,
      set.map((record) => ({
        label: record.externalRef,
        sourceMinor: record.amountMinor,
      })),
    );
  }

  // --- Residue analysis: reference agrees, amount does not ----------------
  // Without this step a mismatched pair would be reported as two unrelated
  // unmatched records, losing the very information that makes it actionable.
  const ledgerByRef = new Map<string, NormalizedRecord[]>();
  for (const ledger of availableLedger.values()) {
    if (ledger.normalizedRef.length === 0) continue;
    const bucket = ledgerByRef.get(ledger.normalizedRef);
    if (bucket === undefined) ledgerByRef.set(ledger.normalizedRef, [ledger]);
    else bucket.push(ledger);
  }

  for (const source of [...availableSource.values()]) {
    if (!availableSource.has(source.id)) continue;
    const candidates = (ledgerByRef.get(source.normalizedRef) ?? []).filter((ledger) =>
      availableLedger.has(ledger.id),
    );
    const ledger = candidates[0];
    if (candidates.length !== 1 || ledger === undefined) continue;

    addException(
      'AMOUNT_MISMATCH',
      [source.id],
      [ledger.id],
      explainMismatch(source, ledger),
      input.domain === 'settlement'
        ? settlementEvidence(source, ledger)
        : [amountEvidence(source.amountMinor, ledger.amountMinor)],
      'Confirm which figure is correct before adjusting the ledger.',
    );
    consume([source.id], [ledger.id]);
  }

  // --- Residue: genuinely unmatched ---------------------------------------
  for (const source of availableSource.values()) {
    addException(
      'UNMATCHED_SOURCE',
      [source.id],
      [],
      `No ledger entry corresponds to ${source.externalRef} for ` +
        `${formatMinor(source.amountMinor)} dated ${source.date}.`,
      [{ label: 'Amount', sourceMinor: source.amountMinor }],
      'Record this transaction in the ledger, or confirm it should not be there.',
    );
  }
  for (const ledger of availableLedger.values()) {
    addException(
      'UNMATCHED_LEDGER',
      [],
      [ledger.id],
      `The external source never confirmed ${ledger.externalRef} for ` +
        `${formatMinor(ledger.amountMinor)} dated ${ledger.date}.`,
      [{ label: 'Amount', ledgerMinor: ledger.amountMinor }],
      'Confirm whether this transaction actually occurred.',
    );
  }

  // --- Advisory: timing ----------------------------------------------------
  // Raised against completed matches: the money is accounted for, it simply
  // moved on a different day. This is why the exception is low severity.
  for (const match of matches) {
    if (Math.abs(match.dayDelta) <= params.dateWindowDays) continue;
    addException(
      'TIMING_DIFFERENCE',
      match.sourceRecordIds,
      match.ledgerEntryIds,
      `Settled ${Math.abs(match.dayDelta)} days ${match.dayDelta > 0 ? 'after' : 'before'} the ` +
        `ledger date, outside the ±${params.dateWindowDays} day window.`,
      [{ label: 'Day difference', note: `${match.dayDelta} days` }],
    );
  }

  // --- Advisory: settlement arithmetic ------------------------------------
  // Checked on source records only: the settlement report is the external claim
  // being verified, and the ledger's copy of it is not independent evidence.
  if (input.domain === 'settlement') {
    for (const record of input.source) {
      if (record.detail.kind !== 'settlement') continue;
      const detail: SettlementDetail = record.detail;
      const implied = subMinor(
        subMinor(subMinor(detail.grossMinor, detail.feesMinor), detail.refundsMinor),
        detail.chargebacksMinor,
      );
      if (implied === detail.netMinor) continue;
      addException(
        'FEE_VARIANCE',
        [record.id],
        [],
        `${record.externalRef}: stated net of ${formatMinor(detail.netMinor)} does not equal ` +
          `gross minus fees, refunds and chargebacks, which comes to ${formatMinor(implied)}.`,
        [
          { label: 'Gross', sourceMinor: detail.grossMinor },
          { label: 'Fees', sourceMinor: detail.feesMinor },
          { label: 'Refunds', sourceMinor: detail.refundsMinor },
          { label: 'Chargebacks', sourceMinor: detail.chargebacksMinor },
          { label: 'Stated net', sourceMinor: detail.netMinor },
          {
            label: 'Implied net',
            sourceMinor: implied,
            note: `differs by ${formatMinor(absMinor(subMinor(detail.netMinor, implied)))}`,
          },
        ],
        'Check the fee schedule applied to this payout.',
      );
    }
  }

  // --- Ordering and statistics --------------------------------------------
  // Highest severity first, then largest amount, so the costliest unexplained
  // gaps surface at the top of the queue. Ties break on the record id, keeping
  // output byte-identical across runs.
  const amountOf = (exception: ReconException): bigint => {
    const line = exception.evidence[0];
    if (line === undefined) return 0n;
    const value = line.sourceMinor ?? line.ledgerMinor ?? toMinor(0n);
    return absMinor(value);
  };
  exceptions.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byAmount = amountOf(b) - amountOf(a);
    if (byAmount !== 0n) return byAmount > 0n ? 1 : -1;
    const idA = `${a.type}|${a.sourceRecordIds[0] ?? ''}|${a.ledgerEntryIds[0] ?? ''}`;
    const idB = `${b.type}|${b.sourceRecordIds[0] ?? ''}|${b.ledgerEntryIds[0] ?? ''}`;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  const matchesByTier: Record<MatchTier, number> = {
    EXACT_REF: 0,
    EXACT_AMOUNT_DATE: 0,
    FUZZY_REF: 0,
    PARTIAL_SET: 0,
  };
  for (const match of matches) matchesByTier[match.tier] += 1;

  const exceptionsByType: Partial<Record<ExceptionType, number>> = {};
  for (const exception of exceptions) {
    exceptionsByType[exception.type] = (exceptionsByType[exception.type] ?? 0) + 1;
  }

  const stats: ReconStats = {
    sourceCount: input.source.length,
    ledgerCount: input.ledger.length,
    matchedCount: matchedSourceIds.size,
    exceptionCount: exceptions.length,
    matchRate: input.source.length === 0 ? 0 : matchedSourceIds.size / input.source.length,
    matchesByTier,
    exceptionsByType,
  };

  return { matches, exceptions, stats, params };
}
