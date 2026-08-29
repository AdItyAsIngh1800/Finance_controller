/**
 * Domain-agnostic discrepancy planting.
 *
 * Both generators plant the same six discrepancy types, and they must plant
 * them *identically*: if the settlement and bank generators drifted apart, a
 * `TIMING_DIFFERENCE` would mean something subtly different in each domain and
 * the two evaluation tables would stop being comparable. Sharing one
 * implementation makes that divergence impossible rather than merely unlikely.
 *
 * Domain-specific planting — currently only `FEE_VARIANCE`, which manipulates
 * settlement arithmetic — stays with its generator.
 *
 * @see docs/EVALUATION.md §2.1 — generation procedure
 * @module
 */

import { addDays } from '../dates';
import { subMinor, sumMinor, toMinor } from '../money';
import { normalizeRef } from '../refs';
import type { NormalizedRecord } from '../types';
import type { PlantCounts, PlantedDiscrepancy, VarianceCounts } from './manifest';
import type { Rng } from './random';

/**
 * One source/ledger pairing during generation, before flattening.
 *
 * Both sides are arrays so a mutation can delete a side (empty), duplicate a
 * record (two entries), or split one transaction into instalments (three).
 */
export interface WorkingPair {
  sourceRecords: NormalizedRecord[];
  ledgerRecords: NormalizedRecord[];
  /** Cleared once a discrepancy is planted here, excluding it from clean pairs. */
  clean: boolean;
}

/**
 * Indexes an array, failing loudly rather than returning `undefined`.
 *
 * `noUncheckedIndexedAccess` widens every lookup; indices here are in range by
 * construction, so a miss indicates a generator bug worth surfacing.
 *
 * @param items - The array to index.
 * @param index - A position known to be in range.
 * @returns The element at that position.
 * @throws {RangeError} If the position is out of range.
 */
export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new RangeError(`generator indexed out of range: ${index} of ${items.length}`);
  }
  return value;
}

/**
 * Creates an allocator handing out distinct pair indices.
 *
 * Distinctness matters: two discrepancies planted on the same pair would
 * corrupt each other's ground truth, making the manifest a description of
 * something the dataset does not contain.
 *
 * @param rng - Seeded generator, so allocation order is reproducible.
 * @param pairCount - Total pairs available.
 * @param reserved - Indices already claimed and not to be handed out.
 * @returns A function returning a fresh index on each call.
 */
export function createIndexAllocator(
  rng: Rng,
  pairCount: number,
  reserved: readonly number[] = [],
): () => number {
  const used = new Set<number>(reserved);
  return (): number => {
    // Bounded retry: planted items are a small fraction of pairCount, so
    // collisions are rare and this terminates quickly.
    for (let attempt = 0; attempt < pairCount * 10; attempt += 1) {
      const candidate = rng.int(0, pairCount - 1);
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    throw new RangeError('could not allocate a free pair index for planting');
  };
}

/**
 * Plants the six domain-agnostic discrepancy types, mutating `pairs` in place.
 *
 * Each mutation marks its pair as no longer clean, so the caller's clean-pair
 * list — against which false matches are measured — stays accurate.
 *
 * @param pairs - Clean pairs to mutate.
 * @param rng - Seeded generator.
 * @param counts - How many of each type to plant.
 * @param nextIndex - Allocator yielding distinct, unclaimed pair indices.
 * @returns The planted discrepancies, in planting order.
 */
export function plantGenericDiscrepancies(
  pairs: WorkingPair[],
  rng: Rng,
  counts: PlantCounts,
  nextIndex: () => number,
): PlantedDiscrepancy[] {
  const planted: PlantedDiscrepancy[] = [];

  // Records the external source reports but the ledger never recorded.
  for (let n = 0; n < counts.unmatchedSource; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    pair.ledgerRecords = [];
    pair.clean = false;
    planted.push({
      id: `planted-unmatched-source-${n}`,
      type: 'UNMATCHED_SOURCE',
      sourceRecordIds: [source.id],
      ledgerEntryIds: [],
      expectsMatch: false,
      note: `Ledger entry ${ledger.id} deleted; the external record has no internal counterpart.`,
    });
  }

  // Ledger entries the external source never confirmed.
  for (let n = 0; n < counts.unmatchedLedger; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    pair.sourceRecords = [];
    pair.clean = false;
    planted.push({
      id: `planted-unmatched-ledger-${n}`,
      type: 'UNMATCHED_LEDGER',
      sourceRecordIds: [],
      ledgerEntryIds: [ledger.id],
      expectsMatch: false,
      note: `Source record ${source.id} deleted; the expected transaction never arrived.`,
    });
  }

  // Amounts that disagree beyond tolerance.
  for (let n = 0; n < counts.amountMismatch; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    // Well beyond both the proportional tolerance and its floor.
    const shortfall = toMinor(BigInt(rng.int(5_000, 40_000)));
    pair.sourceRecords = [{ ...source, amountMinor: subMinor(source.amountMinor, shortfall) }];
    pair.clean = false;
    planted.push({
      id: `planted-amount-mismatch-${n}`,
      type: 'AMOUNT_MISMATCH',
      sourceRecordIds: [source.id],
      ledgerEntryIds: [ledger.id],
      expectsMatch: false,
      note: `Source amount reduced by ${shortfall} minor units, beyond tolerance.`,
    });
  }

  // Transactions that landed well outside the date window.
  for (let n = 0; n < counts.timingDifference; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    const lateBy = rng.int(6, 14);
    pair.sourceRecords = [{ ...source, date: addDays(source.date, lateBy) }];
    pair.clean = false;
    planted.push({
      id: `planted-timing-${n}`,
      type: 'TIMING_DIFFERENCE',
      sourceRecordIds: [source.id],
      ledgerEntryIds: [ledger.id],
      // Advisory: reference and amount still agree, so the records pair up and
      // the money is accounted for — it simply arrived late.
      expectsMatch: true,
      note: `Date shifted ${lateBy} days later, outside the matching window.`,
    });
  }

  // Two equally viable counterparts, so the engine must refuse to choose.
  for (let n = 0; n < counts.duplicateSuspected; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    const clone: NormalizedRecord = { ...source, id: `${source.id}-dup` };
    pair.sourceRecords = [source, clone];
    pair.clean = false;
    planted.push({
      id: `planted-duplicate-${n}`,
      type: 'DUPLICATE_SUSPECTED',
      sourceRecordIds: [source.id, clone.id],
      ledgerEntryIds: [ledger.id],
      expectsMatch: false,
      note: `${source.externalRef} appears twice; neither copy can be chosen over the other.`,
    });
  }

  // One ledger entry satisfied by several smaller transactions.
  for (let n = 0; n < counts.partialPayment; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    const total = source.amountMinor;
    // Three parts summing exactly to the original. The final part absorbs the
    // remainder so integer division cannot lose paise.
    const firstPart = toMinor(total / 3n);
    const secondPart = toMinor(total / 4n);
    const thirdPart = subMinor(subMinor(total, firstPart), secondPart);

    pair.sourceRecords = [firstPart, secondPart, thirdPart].map((amountMinor, partIndex) => {
      const externalRef = `${source.externalRef}-${partIndex + 1}`;
      return {
        ...source,
        id: `${source.id}-part${partIndex + 1}`,
        externalRef,
        normalizedRef: normalizeRef(externalRef),
        date: addDays(source.date, partIndex),
        amountMinor,
        description: `Instalment ${partIndex + 1} of 3 for ${source.externalRef}`,
      };
    });
    pair.clean = false;

    planted.push({
      id: `planted-partial-${n}`,
      type: 'PARTIAL_PAYMENT',
      sourceRecordIds: pair.sourceRecords.map((record) => record.id),
      ledgerEntryIds: [ledger.id],
      // Advisory: the instalments together account for the full amount.
      expectsMatch: true,
      note: `Transaction split into 3 instalments summing to ${sumMinor([firstPart, secondPart, thirdPart])} minor units.`,
    });
  }

  return planted;
}

/**
 * Applies reference variance to clean pairs, forcing weaker matching tiers.
 *
 * The pairs remain **clean**: both sides still correspond and their amounts
 * still agree, so no exception should result. What changes is only how the
 * engine has to find them. Without this, tier 1 claims every pair on an exact
 * reference and the amount/date and fuzzy tiers go entirely unexercised by the
 * ground-truth suite — leaving half the matching logic validated by nothing.
 *
 * Both transformations preserve reference *uniqueness*. A collision would give
 * two ledger entries the same reference and produce a genuine ambiguity, which
 * would surface as a `DUPLICATE_SUSPECTED` the manifest never planted — a false
 * exception manufactured by the fixture rather than found by the engine.
 *
 * @param pairs - Clean pairs to vary.
 * @param counts - How many pairs to give each kind of variance.
 * @param nextIndex - Allocator yielding distinct, unclaimed pair indices.
 */
export function applyReferenceVariance(
  pairs: WorkingPair[],
  counts: VarianceCounts,
  nextIndex: () => number,
): void {
  // A ledger that files against its own voucher number: no reference overlap at
  // all, so the engine must match on amount and date instead.
  for (let n = 0; n < counts.voucherRef; n += 1) {
    const pair = at(pairs, nextIndex());
    const ledger = at(pair.ledgerRecords, 0);
    const voucherRef = `VCH-${String(90_000 + n)}`;
    pair.ledgerRecords = [
      {
        ...ledger,
        externalRef: voucherRef,
        normalizedRef: normalizeRef(voucherRef),
        description: `${ledger.description} (voucher ${voucherRef})`,
      },
    ];
  }

  // An entry re-keyed by hand from a printed statement, which introduces two
  // things at once: a character transcription error, and a small rounding
  // difference.
  //
  // Both are needed to reach the fuzzy tier. The typo alone defeats exact
  // reference matching, but the amount-and-date tier would then claim the pair
  // before fuzzy matching ever saw it — correct engine behaviour, and the
  // reason this fixture must deny that tier too. The rounding difference sits
  // below the tolerance floor, so it is absorbed rather than reported.
  for (let n = 0; n < counts.typoRef; n += 1) {
    const pair = at(pairs, nextIndex());
    const ledger = at(pair.ledgerRecords, 0);

    // The letter O keyed as a zero. Chosen over corrupting a digit because it
    // leaves the numeric part untouched, which is what keeps the reference
    // unique — a collision would manufacture an ambiguity the manifest never
    // planted.
    const typedRef = ledger.externalRef.replace(/O/, '0').replace(/^U/, 'V');
    if (typedRef === ledger.externalRef) continue;

    const ROUNDING_DRIFT = toMinor(50n); // ₹0.50, under the ₹1.00 tolerance floor
    const adjusted = sumMinor([ledger.amountMinor, ROUNDING_DRIFT]);
    // Keep the settlement payload coherent with the adjusted amount, so the
    // fixture never carries an internal inconsistency of its own.
    const detail =
      ledger.detail.kind === 'settlement'
        ? { ...ledger.detail, netMinor: adjusted }
        : ledger.detail;

    pair.ledgerRecords = [
      {
        ...ledger,
        externalRef: typedRef,
        normalizedRef: normalizeRef(typedRef),
        amountMinor: adjusted,
        detail,
      },
    ];
  }
}
