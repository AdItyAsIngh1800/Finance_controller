/**
 * Synthetic bank-statement dataset generator.
 *
 * Produces bank statement lines paired with general-ledger entries, planting
 * the same six domain-agnostic discrepancies as the settlement generator via
 * the shared {@link plantGenericDiscrepancies}. `FEE_VARIANCE` is deliberately
 * absent: it depends on the gross/fees/net identity, which exists only in
 * settlement data.
 *
 * Note the sign convention. Real statements express direction with a
 * debit/credit column; this generator folds that into the sign of
 * `amountMinor` (credits positive, debits negative) exactly as the bank adapter
 * will, so the engine never reasons about direction.
 *
 * @see docs/REQUIREMENTS.md FR-8.4 — settlement-only checks suppressed in bank mode
 * @module
 */

import { addDays } from '../dates';
import { toMinor } from '../money';
import { normalizeRef } from '../refs';
import type { BankDetail, NormalizedRecord } from '../types';
import type { CleanPair, GeneratedDataset, GenerateOptions } from './manifest';
import { at, createIndexAllocator, plantGenericDiscrepancies, type WorkingPair } from './plant';
import { createRng } from './random';

/** Counterparties appearing in generated narrations. */
const COUNTERPARTIES = [
  'ACME RETAIL',
  'BLUEBIRD LOGISTICS',
  'CEDAR SUPPLIES',
  'DELTA MEDIA',
  'EASTGATE FOODS',
] as const;

/** Payment rails appearing in generated narrations. */
const RAILS = ['NEFT', 'IMPS', 'RTGS', 'UPI'] as const;

/**
 * Default generation options.
 *
 * `feeVariance` is zero: the bank domain has no settlement identity to break,
 * and the shared planting routine ignores the field regardless.
 */
export const DEFAULT_BANK_OPTIONS: GenerateOptions = {
  seed: 20_260_905,
  pairCount: 250,
  startDate: '2026-07-01',
  plant: {
    unmatchedSource: 3,
    unmatchedLedger: 2,
    amountMismatch: 2,
    timingDifference: 5,
    duplicateSuspected: 2,
    partialPayment: 1,
    feeVariance: 0,
  },
};

/**
 * Generates a bank dataset with planted, recorded discrepancies.
 *
 * @param options - Generation options; defaults to {@link DEFAULT_BANK_OPTIONS}.
 * @returns Both sides of the dataset plus its ground-truth manifest.
 */
export function generateBankDataset(
  options: GenerateOptions = DEFAULT_BANK_OPTIONS,
): GeneratedDataset {
  const { seed, pairCount, startDate, plant } = options;
  const rng = createRng(seed);

  // --- 1. Clean pairs -----------------------------------------------------
  const pairs: WorkingPair[] = [];
  for (let index = 0; index < pairCount; index += 1) {
    const utr = `UTR${String(100_000 + index)}`;
    const counterparty = rng.pick(COUNTERPARTIES);
    const rail = rng.pick(RAILS);
    const narration = `${rail}/${counterparty}/${utr}`;
    const bookedDate = addDays(startDate, rng.int(0, 44));
    // Bank posting lags the ledger by nought to two days — inside the window.
    const postedDate = addDays(bookedDate, rng.int(0, 2));

    // Most lines are incoming receipts; a minority are outgoing payments.
    const isCredit = rng.bool(0.7);
    const magnitude = BigInt(rng.int(20_000, 500_000));
    const amountMinor = toMinor(isCredit ? magnitude : -magnitude);

    const detail: BankDetail = {
      kind: 'bank',
      narration,
      direction: isCredit ? 'credit' : 'debit',
      balanceMinor: toMinor(BigInt(rng.int(1_000_000, 9_000_000))),
      utr,
    };

    const common = {
      externalRef: utr,
      normalizedRef: normalizeRef(utr),
      amountMinor,
      detail,
    };

    pairs.push({
      clean: true,
      sourceRecords: [
        {
          ...common,
          id: `s-${index}`,
          side: 'source',
          date: postedDate,
          description: narration,
        },
      ],
      ledgerRecords: [
        {
          ...common,
          id: `l-${index}`,
          side: 'ledger',
          date: bookedDate,
          description: `${isCredit ? 'Receipt from' : 'Payment to'} ${counterparty}`,
        },
      ],
    });
  }

  // --- 2. Planted discrepancies -------------------------------------------
  const nextIndex = createIndexAllocator(rng, pairCount);
  const planted = plantGenericDiscrepancies(pairs, rng, plant, nextIndex);

  // --- 3. Flatten and record ground truth ---------------------------------
  const source: NormalizedRecord[] = [];
  const ledger: NormalizedRecord[] = [];
  const cleanPairs: CleanPair[] = [];

  for (const pair of pairs) {
    source.push(...pair.sourceRecords);
    ledger.push(...pair.ledgerRecords);
    if (pair.clean) {
      cleanPairs.push({
        sourceRecordId: at(pair.sourceRecords, 0).id,
        ledgerEntryId: at(pair.ledgerRecords, 0).id,
      });
    }
  }

  return {
    domain: 'bank',
    source,
    ledger,
    manifest: { domain: 'bank', seed, basePairCount: pairCount, planted, cleanPairs },
  };
}
