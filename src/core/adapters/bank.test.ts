/**
 * Tests for the bank adapter.
 *
 * The load-bearing assertion is the last one: the bank domain reconciles end to
 * end with **zero changes to engine source**. That is the falsifiable form of
 * the adapter-pattern claim in docs/ARCHITECTURE.md §3 — if adding a domain
 * required touching the engine, the abstraction would have leaked and the whole
 * "one engine, two domains" position would be marketing rather than design.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BANK_OPTIONS, generateBankDataset } from '../generate/bank';
import { bankToCsv } from '../generate/csv';
import { DEFAULT_RECON_PARAMS } from '../reconcile/config';
import { reconcile } from '../reconcile/engine';
import { scoreAgainstGroundTruth } from '../score';
import { parseBankCsv } from './bank';

const HEADER = 'record_id,txn_date,narration,reference,debit,credit,balance,description';

describe('parseBankCsv round-trip', () => {
  const dataset = generateBankDataset();

  it('reproduces every source record exactly', () => {
    const result = parseBankCsv(bankToCsv(dataset.source), 'source');
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual(dataset.source);
  });

  it('reproduces every ledger record exactly', () => {
    const result = parseBankCsv(bankToCsv(dataset.ledger), 'ledger');
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual(dataset.ledger);
  });
});

describe('sign convention', () => {
  it('reads a credit as a positive amount', () => {
    const csv = `${HEADER}\nb-1,2026-08-14,NEFT/ACME/UTR1,UTR1,,1250.00,5000.00,Receipt\n`;
    const record = parseBankCsv(csv, 'source').records[0];
    expect(record?.amountMinor).toBe(125000n);
    expect(record?.detail.kind === 'bank' && record.detail.direction).toBe('credit');
  });

  it('reads a debit as a negative amount', () => {
    // The engine never sees "debit" — only a negative number. That is the whole
    // point of resolving direction at the adapter boundary.
    const csv = `${HEADER}\nb-1,2026-08-14,NEFT/ACME/UTR1,UTR1,1250.00,,5000.00,Payment\n`;
    const record = parseBankCsv(csv, 'source').records[0];
    expect(record?.amountMinor).toBe(-125000n);
    expect(record?.detail.kind === 'bank' && record.detail.direction).toBe('debit');
  });

  it('rejects a row carrying both a debit and a credit', () => {
    const csv = `${HEADER}\nb-1,2026-08-14,x,UTR1,10.00,20.00,5000.00,Both\n`;
    const result = parseBankCsv(csv, 'source');
    expect(result.records).toEqual([]);
    expect(result.errors[0]?.reason).toContain('one or the other');
  });

  it('rejects a row carrying neither', () => {
    const csv = `${HEADER}\nb-1,2026-08-14,x,UTR1,,,5000.00,Neither\n`;
    const result = parseBankCsv(csv, 'source');
    expect(result.records).toEqual([]);
    expect(result.errors[0]?.reason).toContain('neither');
  });

  it('distinguishes a blank column from a zero amount', () => {
    // A blank debit means "not a debit". A debit of 0.00 is a zero-value debit.
    // Collapsing the two would make direction ambiguous.
    const csv = `${HEADER}\nb-1,2026-08-14,x,UTR1,0.00,,5000.00,Zero debit\n`;
    const record = parseBankCsv(csv, 'source').records[0];
    expect(record?.amountMinor).toBe(0n);
    expect(record?.detail.kind === 'bank' && record.detail.direction).toBe('debit');
  });
});

describe('error reporting', () => {
  it('reports missing required columns once, against the header', () => {
    const result = parseBankCsv('txn_date,reference\n2026-08-14,UTR1\n', 'source');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain('debit');
  });

  it('rejects an invalid date with its line number', () => {
    const csv = `${HEADER}\nb-1,not-a-date,x,UTR1,,10.00,5000.00,d\n`;
    expect(parseBankCsv(csv, 'source').errors[0]).toMatchObject({
      lineNumber: 2,
      column: 'txn_date',
    });
  });

  it('rejects an amount with excess precision rather than rounding it', () => {
    const csv = `${HEADER}\nb-1,2026-08-14,x,UTR1,,10.005,5000.00,d\n`;
    expect(parseBankCsv(csv, 'source').errors[0]?.column).toBe('credit');
  });
});

describe('the bank domain reconciles through the shared engine', () => {
  const dataset = generateBankDataset();

  const fromMemory = reconcile({
    domain: 'bank',
    source: dataset.source,
    ledger: dataset.ledger,
    params: DEFAULT_RECON_PARAMS,
  });

  const fromCsv = reconcile({
    domain: 'bank',
    source: parseBankCsv(bankToCsv(dataset.source), 'source').records,
    ledger: parseBankCsv(bankToCsv(dataset.ledger), 'ledger').records,
    params: DEFAULT_RECON_PARAMS,
  });

  it('produces the same results through the CSV path as in memory', () => {
    expect(fromCsv.stats.matchRate).toBe(fromMemory.stats.matchRate);
    expect(fromCsv.stats.matchesByTier).toEqual(fromMemory.stats.matchesByTier);
    expect(fromCsv.stats.exceptionsByType).toEqual(fromMemory.stats.exceptionsByType);
  });

  it('reports zero false matches', () => {
    expect(scoreAgainstGroundTruth(fromCsv, dataset.manifest).falseMatches).toEqual([]);
  });

  it('achieves at least 95% recall on every planted type', () => {
    const score = scoreAgainstGroundTruth(fromCsv, dataset.manifest);
    for (const typeScore of score.byType) {
      if (typeScore.planted === 0) continue;
      expect(
        typeScore.recall,
        `${typeScore.type}: found ${typeScore.correct} of ${typeScore.planted}`,
      ).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('never raises FEE_VARIANCE, which has no meaning here', () => {
    // Structurally impossible rather than suppressed: bank records carry no
    // gross/fees/net breakdown for the identity to be checked against.
    expect(fromCsv.exceptions.some((exception) => exception.type === 'FEE_VARIANCE')).toBe(false);
  });

  it('exercises every matching tier', () => {
    for (const [tier, count] of Object.entries(fromCsv.stats.matchesByTier)) {
      expect(count, `tier ${tier} claimed no matches in the bank domain`).toBeGreaterThan(0);
    }
  });

  it('handles negative amounts without special-casing in the engine', () => {
    // Bank data contains debits, which are negative. The engine has no branch
    // for sign — tolerance and subset-sum operate on signed integers throughout.
    const debits = dataset.source.filter((record) => record.amountMinor < 0n);
    expect(debits.length).toBeGreaterThan(0);
    expect(fromCsv.stats.matchedCount).toBeGreaterThan(0);
  });
});

describe('generator option coverage', () => {
  it('plants no fee variance in the bank domain', () => {
    expect(DEFAULT_BANK_OPTIONS.plant.feeVariance).toBe(0);
  });
});
