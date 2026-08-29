/**
 * Tests for CSV parsing and the settlement adapter.
 *
 * The round-trip case is the load-bearing one: generate a dataset, serialize it
 * to a domain-native CSV, parse it back, and require the records to be
 * identical. That exercises the writer and the reader against each other, so a
 * disagreement between them cannot pass unnoticed — and it is the same path a
 * real upload takes.
 */

import { describe, expect, it } from 'vitest';
import { settlementToCsv } from '../generate/csv';
import { generateSettlementDataset } from '../generate/settlement';
import { DEFAULT_RECON_PARAMS } from '../reconcile/config';
import { reconcile } from '../reconcile/engine';
import { scoreAgainstGroundTruth } from '../score';
import { CsvParseError, columnReader, missingColumns, parseCsv } from './csv';
import { parseSettlementCsv } from './settlement';

describe('parseCsv', () => {
  it('parses a simple table', () => {
    const table = parseCsv('a,b\n1,2\n');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows).toEqual([{ lineNumber: 2, values: ['1', '2'] }]);
  });

  it('lowercases and trims header names for case-insensitive lookup', () => {
    expect(parseCsv('  Order_Ref , TXN_DATE \nx,y\n').header).toEqual(['order_ref', 'txn_date']);
  });

  it('resolves quoted fields containing commas', () => {
    const table = parseCsv('a,b\n1,"x,y"\n');
    expect(table.rows[0]?.values).toEqual(['1', 'x,y']);
  });

  it('resolves doubled quotes as a literal quote', () => {
    const table = parseCsv('a\n"say ""hi"""\n');
    expect(table.rows[0]?.values).toEqual(['say "hi"']);
  });

  it('keeps newlines that appear inside a quoted field', () => {
    const table = parseCsv('a,b\n1,"line one\nline two"\n');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.values[1]).toBe('line one\nline two');
  });

  it('counts lines past an embedded newline so later rows report correctly', () => {
    const table = parseCsv('a\n"x\ny"\nz\n');
    expect(table.rows[1]?.lineNumber).toBe(4);
    expect(table.rows[1]?.values).toEqual(['z']);
  });

  it('handles CRLF line endings', () => {
    const table = parseCsv('a,b\r\n1,2\r\n');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows[0]?.values).toEqual(['1', '2']);
  });

  it('strips a leading byte-order mark', () => {
    // Excel writes one without asking; left in place it corrupts the first
    // column name and every lookup against it fails invisibly.
    expect(parseCsv('﻿a,b\n1,2\n').header).toEqual(['a', 'b']);
  });

  it('skips blank lines rather than reporting them as malformed rows', () => {
    const table = parseCsv('a\n1\n\n2\n\n');
    expect(table.rows.map((row) => row.values[0])).toEqual(['1', '2']);
  });

  it('parses a final row with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2').rows[0]?.values).toEqual(['1', '2']);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('a\n"never closed\n')).toThrow(CsvParseError);
  });

  it('rejects empty input', () => {
    expect(() => parseCsv('')).toThrow(CsvParseError);
    expect(() => parseCsv('\n\n')).toThrow(CsvParseError);
  });
});

describe('column helpers', () => {
  const table = parseCsv('Order_Ref,Net\nORD-1,10.00\n');

  it('reads columns case-insensitively', () => {
    const read = columnReader(table);
    const row = table.rows[0];
    expect(row).toBeDefined();
    expect(read(row!, 'ORDER_REF')).toBe('ORD-1');
    expect(read(row!, ' net ')).toBe('10.00');
  });

  it('reports absent columns', () => {
    expect(missingColumns(table, ['order_ref', 'txn_date', 'net'])).toEqual(['txn_date']);
  });
});

describe('parseSettlementCsv round-trip', () => {
  const dataset = generateSettlementDataset();

  it('reproduces every source record exactly', () => {
    const result = parseSettlementCsv(settlementToCsv(dataset.source), 'source');
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual(dataset.source);
  });

  it('reproduces every ledger record exactly', () => {
    const result = parseSettlementCsv(settlementToCsv(dataset.ledger), 'ledger');
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual(dataset.ledger);
  });

  it('preserves a fee total that the itemised columns do not explain', () => {
    // The planted FEE_VARIANCE survives serialization and parsing. Recomputing
    // fees from the line items would erase the anomaly before the engine saw it.
    const feeVarianceId = dataset.manifest.planted.find((item) => item.type === 'FEE_VARIANCE')
      ?.sourceRecordIds[0];
    expect(feeVarianceId).toBeDefined();

    const parsed = parseSettlementCsv(settlementToCsv(dataset.source), 'source');
    const record = parsed.records.find((item) => item.id === feeVarianceId);
    expect(record).toBeDefined();
    if (record?.detail.kind !== 'settlement') throw new Error('expected settlement detail');

    const itemised = record.detail.feeLines.reduce((total, line) => total + line.amountMinor, 0n);
    expect(record.detail.feesMinor).not.toBe(itemised);
  });
});

describe('parseSettlementCsv error reporting', () => {
  const header = 'record_id,order_ref,txn_date,gross,commission,gateway_fee,fees_total,refunds,chargebacks,net,description';

  it('reports missing required columns once, against the header', () => {
    const result = parseSettlementCsv('order_ref,net\nORD-1,10.00\n', 'source');
    expect(result.records).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain('txn_date');
  });

  it('reports an invalid date with its line number and column', () => {
    const csv = `${header}\ns-1,ORD-1,not-a-date,100.00,2.00,1.00,3.00,0.00,0.00,97.00,x\n`;
    const result = parseSettlementCsv(csv, 'source');
    expect(result.records).toEqual([]);
    expect(result.errors[0]).toMatchObject({ lineNumber: 2, column: 'txn_date' });
  });

  it('rejects a date that looks valid but does not exist', () => {
    const csv = `${header}\ns-1,ORD-1,2026-02-30,100.00,2.00,1.00,3.00,0.00,0.00,97.00,x\n`;
    expect(parseSettlementCsv(csv, 'source').errors[0]?.column).toBe('txn_date');
  });

  it('rejects an amount with excess precision rather than rounding it', () => {
    const csv = `${header}\ns-1,ORD-1,2026-08-14,100.00,2.00,1.00,3.00,0.00,0.00,97.005,x\n`;
    const result = parseSettlementCsv(csv, 'source');
    expect(result.records).toEqual([]);
    expect(result.errors[0]?.column).toBe('net');
  });

  it('reports every bad row, not merely the first', () => {
    // A user with three bad rows should learn about all three at once rather
    // than fixing them one upload at a time.
    const csv =
      `${header}\n` +
      `s-1,ORD-1,bad,100.00,2.00,1.00,3.00,0.00,0.00,97.00,x\n` +
      `s-2,ORD-2,2026-08-14,100.00,2.00,1.00,3.00,0.00,0.00,oops,x\n` +
      `s-3,,2026-08-14,100.00,2.00,1.00,3.00,0.00,0.00,97.00,x\n`;
    const result = parseSettlementCsv(csv, 'source');
    expect(result.records).toEqual([]);
    expect(result.errors.map((error) => error.lineNumber)).toEqual([2, 3, 4]);
  });

  it('treats absent optional amounts as zero', () => {
    const csv = 'order_ref,txn_date,net\nORD-1,2026-08-14,97.00\n';
    const result = parseSettlementCsv(csv, 'source');
    expect(result.errors).toEqual([]);
    const record = result.records[0];
    if (record?.detail.kind !== 'settlement') throw new Error('expected settlement detail');
    expect(record.detail.chargebacksMinor).toBe(0n);
    expect(record.amountMinor).toBe(9700n);
  });

  it('rejects a present but unparseable optional amount', () => {
    // Distinct from absent: reading "N/A" as zero would understate a discrepancy.
    const csv = 'order_ref,txn_date,net,refunds\nORD-1,2026-08-14,97.00,N/A\n';
    expect(parseSettlementCsv(csv, 'source').errors[0]?.column).toBe('refunds');
  });
});

describe('the CSV path produces the same reconciliation as the in-memory path', () => {
  // The Phase 5 gate: the dashboard's match rate must equal the test suite's
  // figure for the same fixture. Any divergence between what the generator
  // produces and what an upload parses back is a bug that would surface as the
  // deployed app disagreeing with EVALUATION.md — which is exactly the kind of
  // discrepancy nobody notices until a judge asks about it.
  const dataset = generateSettlementDataset();

  const fromMemory = reconcile({
    domain: 'settlement',
    source: dataset.source,
    ledger: dataset.ledger,
    params: DEFAULT_RECON_PARAMS,
  });

  const fromCsv = reconcile({
    domain: 'settlement',
    source: parseSettlementCsv(settlementToCsv(dataset.source), 'source').records,
    ledger: parseSettlementCsv(settlementToCsv(dataset.ledger), 'ledger').records,
    params: DEFAULT_RECON_PARAMS,
  });

  it('reports the same match rate', () => {
    expect(fromCsv.stats.matchRate).toBe(fromMemory.stats.matchRate);
  });

  it('claims matches on the same tiers in the same proportions', () => {
    expect(fromCsv.stats.matchesByTier).toEqual(fromMemory.stats.matchesByTier);
  });

  it('raises the same exceptions, by type and count', () => {
    expect(fromCsv.stats.exceptionsByType).toEqual(fromMemory.stats.exceptionsByType);
  });

  it('scores identically against ground truth', () => {
    const memoryScore = scoreAgainstGroundTruth(fromMemory, dataset.manifest);
    const csvScore = scoreAgainstGroundTruth(fromCsv, dataset.manifest);
    expect(csvScore.falseMatches).toEqual([]);
    expect(csvScore.minRecall).toBe(memoryScore.minRecall);
    expect(csvScore.minPrecision).toBe(memoryScore.minPrecision);
  });
});
