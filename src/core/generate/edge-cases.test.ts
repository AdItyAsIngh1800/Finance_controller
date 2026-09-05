/**
 * Edge-case corpus assertions.
 *
 * Runs every case in {@link EDGE_CASES} through the same path an upload takes —
 * domain adapter, then engine — and asserts the outcome the case states.
 *
 * The ground-truth suite measures accuracy on realistic data; this one measures
 * behaviour on data that is wrong. They fail for different reasons and neither
 * substitutes for the other.
 *
 * @see docs/REQUIREMENTS.md FR-3.3 — malformed rows rejected with a reason
 * @module
 */

import { describe, expect, it } from 'vitest';
import { parseBankCsv } from '../adapters/bank';
import { parseSettlementCsv } from '../adapters/settlement';
import type { AdapterResult } from '../adapters/types';
import { DEFAULT_RECON_PARAMS } from '../reconcile/config';
import { reconcile } from '../reconcile/engine';
import { EXCEPTION_TYPES } from '../taxonomy';
import type { ExceptionType } from '../types';
import { EDGE_CASES, type EdgeCase } from './edge-cases';

/**
 * Parses one case's files and reconciles whatever survived.
 *
 * Records are reconciled even when the other side reported errors. Ingestion
 * rejects a partial file rather than running it, but the engine must still
 * behave sensibly on a lopsided input — that is what the demo hits when someone
 * uploads one good file and one bad one.
 *
 * @param edgeCase - The case to run.
 * @returns Both adapter results and the reconciliation of their records.
 */
function runCase(edgeCase: EdgeCase): {
  source: AdapterResult;
  ledger: AdapterResult;
  counts: Readonly<Record<ExceptionType, number>>;
  matchCount: number;
} {
  const parse = edgeCase.domain === 'bank' ? parseBankCsv : parseSettlementCsv;
  const source = parse(edgeCase.sourceCsv, 'source');
  const ledger = parse(edgeCase.ledgerCsv, 'ledger');

  const result = reconcile({
    domain: edgeCase.domain,
    source: source.records,
    ledger: ledger.records,
    params: DEFAULT_RECON_PARAMS,
  });

  // Every type starts at zero, so a case that omits a type is asserting its
  // absence rather than merely not mentioning it.
  const counts = Object.fromEntries(
    EXCEPTION_TYPES.map((type) => [
      type,
      result.exceptions.filter((exception) => exception.type === type).length,
    ]),
  ) as Record<ExceptionType, number>;

  return { source, ledger, counts, matchCount: result.matches.length };
}

describe.each(EDGE_CASES)('$category: $name', (edgeCase) => {
  const { source, ledger, counts, matchCount } = runCase(edgeCase);

  it('parses the stated number of records and errors', () => {
    expect({
      sourceRecords: source.records.length,
      sourceErrors: source.errors.length,
      ledgerRecords: ledger.records.length,
      ledgerErrors: ledger.errors.length,
    }).toEqual({
      sourceRecords: edgeCase.expect.sourceRecords,
      sourceErrors: edgeCase.expect.sourceErrors,
      ledgerRecords: edgeCase.expect.ledgerRecords,
      ledgerErrors: edgeCase.expect.ledgerErrors,
    });
  });

  it('reports every rejection with a line number and a reason', () => {
    for (const error of [...source.errors, ...ledger.errors]) {
      // "Malformed CSV" is not a usable message for someone holding a 250-row
      // export; the line is what makes a rejection actionable.
      expect(error.lineNumber).toBeGreaterThan(0);
      expect(error.reason.length).toBeGreaterThan(0);
    }
  });

  it('reconciles to the stated matches and exceptions', () => {
    const expected = Object.fromEntries(
      EXCEPTION_TYPES.map((type) => [type, edgeCase.expect.exceptions[type] ?? 0]),
    );
    expect({ matches: matchCount, ...counts }).toEqual({
      matches: edgeCase.expect.matches,
      ...expected,
    });
  });
});

describe('the corpus itself', () => {
  it('gives every case a unique name, since the name is its fixture directory', () => {
    const names = EDGE_CASES.map((edgeCase) => edgeCase.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers all four categories', () => {
    const categories = new Set(EDGE_CASES.map((edgeCase) => edgeCase.category));
    expect([...categories].sort()).toEqual([
      'domain quirk',
      'engine scenario',
      'hostile value',
      'malformed file',
    ]);
  });

  it('covers both domains', () => {
    const domains = new Set(EDGE_CASES.map((edgeCase) => edgeCase.domain));
    expect([...domains].sort()).toEqual(['bank', 'settlement']);
  });
});
