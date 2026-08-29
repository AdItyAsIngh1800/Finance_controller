/**
 * Tests for the synthetic data generators.
 *
 * Two properties matter here more than anything else:
 *
 * 1. **Determinism.** Fixtures are gitignored, so no diff exists to reveal a
 *    generator change silently altering the data every accuracy figure is
 *    measured against. This suite is the only thing standing in for that diff.
 * 2. **Manifest integrity.** The manifest is the ground truth. If it claims a
 *    discrepancy the dataset does not contain — or omits one it does — then
 *    precision and recall are measured against fiction.
 */

import { describe, expect, it } from 'vitest';
import { subMinor, sumMinor, type Minor } from '../money';
import type { NormalizedRecord, SettlementDetail } from '../types';
import { DEFAULT_BANK_OPTIONS, generateBankDataset } from './bank';
import { bankToCsv, settlementToCsv } from './csv';
import type { GeneratedDataset } from './manifest';
import {
  DEFAULT_SETTLEMENT_OPTIONS,
  generateSettlementDataset,
  SHOWCASE_ORDER_REF,
} from './settlement';
import { createRng } from './random';

/** Serializes a dataset for comparison, rendering bigints as strings. */
function stableStringify(dataset: GeneratedDataset): string {
  return JSON.stringify(dataset, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

/** Total planted discrepancies implied by a set of counts. */
function expectedPlantCount(counts: typeof DEFAULT_SETTLEMENT_OPTIONS.plant): number {
  return (
    counts.unmatchedSource +
    counts.unmatchedLedger +
    counts.amountMismatch +
    counts.timingDifference +
    counts.duplicateSuspected +
    counts.partialPayment +
    counts.feeVariance
  );
}

describe('createRng', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const drawA = Array.from({ length: 50 }, () => a.next());
    const drawB = Array.from({ length: 50 }, () => b.next());
    expect(drawA).toEqual(drawB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = Array.from({ length: 20 }, createRng(1).next);
    const b = Array.from({ length: 20 }, createRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('stays within the requested integer bounds', () => {
    const rng = createRng(7);
    for (let n = 0; n < 500; n += 1) {
      const value = rng.int(3, 9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }
  });

  it('rejects inverted or non-integer bounds, and empty picks', () => {
    const rng = createRng(7);
    expect(() => rng.int(9, 3)).toThrow(RangeError);
    expect(() => rng.int(1.5, 3)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe('determinism', () => {
  // The compensating control for fixtures being gitignored rather than
  // committed. If this fails, every number on the evaluation page has silently
  // moved.
  it('regenerates the settlement dataset byte-identically', () => {
    expect(stableStringify(generateSettlementDataset())).toBe(
      stableStringify(generateSettlementDataset()),
    );
  });

  it('regenerates the bank dataset byte-identically', () => {
    expect(stableStringify(generateBankDataset())).toBe(stableStringify(generateBankDataset()));
  });

  it('produces identical CSV output across runs', () => {
    expect(settlementToCsv(generateSettlementDataset().source)).toBe(
      settlementToCsv(generateSettlementDataset().source),
    );
  });

  it('produces different data for a different seed', () => {
    const other = generateSettlementDataset({ ...DEFAULT_SETTLEMENT_OPTIONS, seed: 999 });
    expect(stableStringify(other)).not.toBe(stableStringify(generateSettlementDataset()));
  });
});

describe('settlement manifest integrity', () => {
  const dataset = generateSettlementDataset();
  const { manifest } = dataset;

  it('plants exactly the configured number of discrepancies', () => {
    expect(manifest.planted).toHaveLength(expectedPlantCount(DEFAULT_SETTLEMENT_OPTIONS.plant));
  });

  it('accounts for every base pair as either planted or clean', () => {
    expect(manifest.cleanPairs.length + manifest.planted.length).toBe(manifest.basePairCount);
  });

  it('never marks a mutated pair as clean', () => {
    const plantedIds = new Set(manifest.planted.flatMap((item) => item.sourceRecordIds));
    for (const pair of manifest.cleanPairs) {
      expect(plantedIds.has(pair.sourceRecordId)).toBe(false);
    }
  });

  it('references only records that exist in the dataset', () => {
    const sourceIds = new Set(dataset.source.map((record) => record.id));
    const ledgerIds = new Set(dataset.ledger.map((record) => record.id));
    for (const item of manifest.planted) {
      // Deleted records are the point of UNMATCHED_*, so those ids are expected
      // to be absent from their side; every other reference must resolve.
      if (item.type !== 'UNMATCHED_SOURCE' && item.type !== 'UNMATCHED_LEDGER') {
        for (const id of item.ledgerEntryIds) expect(ledgerIds.has(id)).toBe(true);
      }
      if (item.type === 'UNMATCHED_SOURCE') {
        for (const id of item.sourceRecordIds) expect(sourceIds.has(id)).toBe(true);
      }
    }
  });

  it('marks advisory discrepancies as still expecting a match', () => {
    const advisory = manifest.planted.filter((item) =>
      ['TIMING_DIFFERENCE', 'PARTIAL_PAYMENT', 'FEE_VARIANCE'].includes(item.type),
    );
    expect(advisory.length).toBeGreaterThan(0);
    for (const item of advisory) expect(item.expectsMatch).toBe(true);
  });

  it('marks blocking discrepancies as expecting no match', () => {
    const blocking = manifest.planted.filter((item) =>
      ['UNMATCHED_SOURCE', 'UNMATCHED_LEDGER', 'AMOUNT_MISMATCH', 'DUPLICATE_SUSPECTED'].includes(
        item.type,
      ),
    );
    expect(blocking.length).toBeGreaterThan(0);
    for (const item of blocking) expect(item.expectsMatch).toBe(false);
  });

  it('gives every planted item a unique id', () => {
    const ids = manifest.planted.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('settlement arithmetic', () => {
  const dataset = generateSettlementDataset();

  /** Records whose settlement identity was deliberately broken. */
  const feeVarianceIds = new Set(
    dataset.manifest.planted
      .filter((item) => item.type === 'FEE_VARIANCE')
      .flatMap((item) => item.sourceRecordIds),
  );

  it('balances net = gross - fees - refunds - chargebacks on every clean record', () => {
    for (const record of dataset.source) {
      if (feeVarianceIds.has(record.id)) continue;
      const detail = record.detail as SettlementDetail;
      const expected = subMinor(
        subMinor(subMinor(detail.grossMinor, detail.feesMinor), detail.refundsMinor),
        detail.chargebacksMinor,
      );
      expect(detail.netMinor).toBe(expected);
    }
  });

  it('breaks that identity on exactly the planted fee-variance records', () => {
    expect(feeVarianceIds.size).toBeGreaterThan(0);
    for (const record of dataset.source) {
      if (!feeVarianceIds.has(record.id)) continue;
      const detail = record.detail as SettlementDetail;
      const implied = subMinor(
        subMinor(subMinor(detail.grossMinor, detail.feesMinor), detail.refundsMinor),
        detail.chargebacksMinor,
      );
      expect(detail.netMinor).not.toBe(implied);
    }
  });

  it('keeps stated fees inflated relative to the itemised lines', () => {
    // The whole point of planting it this way: the record still matches its
    // counterpart on amount, so FEE_VARIANCE is isolated from AMOUNT_MISMATCH.
    for (const record of dataset.source) {
      if (!feeVarianceIds.has(record.id)) continue;
      const detail = record.detail as SettlementDetail;
      const itemised = sumMinor(detail.feeLines.map((line) => line.amountMinor));
      expect(detail.feesMinor).not.toBe(itemised);
    }
  });
});

describe('showcase discrepancy', () => {
  const dataset = generateSettlementDataset();

  const findByRef = (records: readonly NormalizedRecord[]): NormalizedRecord | undefined =>
    records.find((record) => record.externalRef === SHOWCASE_ORDER_REF);

  it('exists on both sides of the default dataset', () => {
    expect(findByRef(dataset.source)).toBeDefined();
    expect(findByRef(dataset.ledger)).toBeDefined();
  });

  it('leaves the two sides exactly ₹412.00 apart', () => {
    const source = findByRef(dataset.source);
    const ledger = findByRef(dataset.ledger);
    expect(source).toBeDefined();
    expect(ledger).toBeDefined();
    // Quoted verbatim in the README demo script and docs/DESIGN.md, so this
    // figure must stay real rather than illustrative.
    const gap = subMinor(
      (ledger as NormalizedRecord).amountMinor,
      (source as NormalizedRecord).amountMinor,
    );
    expect(gap).toBe(41_200n);
  });

  it('attributes the gap to a refund the ledger never recorded', () => {
    const source = findByRef(dataset.source) as NormalizedRecord;
    const ledger = findByRef(dataset.ledger) as NormalizedRecord;
    expect((source.detail as SettlementDetail).refundsMinor).toBe(41_200n);
    expect((ledger.detail as SettlementDetail).refundsMinor).toBe(0n);
  });
});

describe('bank dataset', () => {
  const dataset = generateBankDataset();

  it('plants the configured discrepancies', () => {
    expect(dataset.manifest.planted).toHaveLength(expectedPlantCount(DEFAULT_BANK_OPTIONS.plant));
  });

  it('never plants FEE_VARIANCE, which is settlement-only', () => {
    const types = dataset.manifest.planted.map((item) => item.type);
    expect(types).not.toContain('FEE_VARIANCE');
  });

  it('folds debit/credit direction into the sign of the amount', () => {
    for (const record of dataset.source) {
      const detail = record.detail;
      if (detail.kind !== 'bank') throw new Error('expected bank detail');
      // Split records inherit their parent's direction but carry a reduced
      // magnitude, so only the sign is asserted here.
      if (detail.direction === 'credit') expect(record.amountMinor > 0n).toBe(true);
      else expect(record.amountMinor < 0n).toBe(true);
    }
  });
});

describe('csv serialization', () => {
  it('emits one row per record plus a header', () => {
    const dataset = generateSettlementDataset();
    const lines = settlementToCsv(dataset.source).trimEnd().split('\n');
    expect(lines).toHaveLength(dataset.source.length + 1);
    expect(lines[0]).toContain('order_ref');
  });

  it('preserves an inflated fee total that the line items do not explain', () => {
    // Deriving fees_total from the itemised columns would erase the planted
    // anomaly before the engine ever saw the file.
    const dataset = generateSettlementDataset();
    const feeVarianceId = dataset.manifest.planted.find((item) => item.type === 'FEE_VARIANCE')
      ?.sourceRecordIds[0];
    expect(feeVarianceId).toBeDefined();

    const row = settlementToCsv(dataset.source)
      .split('\n')
      .find((line) => line.startsWith(`${feeVarianceId},`));
    expect(row).toBeDefined();

    const [, , , , commission, gateway, feesTotal] = (row as string).split(',');
    const itemised = Number(commission) + Number(gateway);
    expect(Number(feesTotal)).toBeGreaterThan(itemised);
  });

  it('writes bank debits and credits in separate columns', () => {
    const dataset = generateBankDataset();
    const lines = bankToCsv(dataset.source).trimEnd().split('\n');
    expect(lines[0]).toContain('debit');
    expect(lines[0]).toContain('credit');
    // Every data row fills exactly one of the two columns.
    for (const line of lines.slice(1)) {
      const columns = line.split(',');
      const debit = columns[4] ?? '';
      const credit = columns[5] ?? '';
      expect(debit === '' ? credit !== '' : credit === '').toBe(true);
    }
  });
});
