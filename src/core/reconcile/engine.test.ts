/**
 * The engine's ground-truth test suite.
 *
 * This is the load-bearing test in the project. Its output is what
 * `docs/EVALUATION.md` reports and what the `/evaluation` page renders, so it
 * is the whole of the answer to *"how do you know it's right?"*.
 *
 * Two thresholds are asserted, and they are deliberately asymmetric: recall may
 * miss 5%, but **false matches must be zero**. A false exception costs a
 * reviewer thirty seconds; a false match silently conceals the discrepancy this
 * system exists to catch.
 *
 * @see docs/EVALUATION.md §4 — acceptance thresholds
 * @see docs/REQUIREMENTS.md NFR-1.1, NFR-1.2, NFR-1.4
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BANK_OPTIONS, generateBankDataset } from '../generate/bank';
import type { GeneratedDataset } from '../generate/manifest';
import {
  DEFAULT_SETTLEMENT_OPTIONS,
  generateSettlementDataset,
  SHOWCASE_ORDER_REF,
} from '../generate/settlement';
import { scoreAgainstGroundTruth } from '../score';
import type { ReconResult } from '../types';
import { DEFAULT_RECON_PARAMS } from './config';
import { reconcile } from './engine';

/** Runs the engine over a generated dataset with default thresholds. */
function run(dataset: GeneratedDataset): ReconResult {
  return reconcile({
    domain: dataset.domain,
    source: dataset.source,
    ledger: dataset.ledger,
    params: DEFAULT_RECON_PARAMS,
  });
}

/** Serializes a result for comparison, rendering bigints as strings. */
function stableStringify(result: ReconResult): string {
  return JSON.stringify(result, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

describe('settlement reconciliation', () => {
  const dataset = generateSettlementDataset();
  const result = run(dataset);
  const score = scoreAgainstGroundTruth(result, dataset.manifest);

  it('reports zero false matches', () => {
    // NFR-1.2. The primary metric — stricter than recall on purpose.
    expect(score.falseMatches).toEqual([]);
  });

  it('achieves at least 95% recall on every planted type', () => {
    // NFR-1.1, asserted per type rather than in aggregate: an engine can be
    // excellent at unmatched records and blind to fee variance, and an average
    // would hide exactly that.
    for (const typeScore of score.byType) {
      if (typeScore.planted === 0) continue;
      expect(
        typeScore.recall,
        `${typeScore.type}: found ${typeScore.correct} of ${typeScore.planted}`,
      ).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('achieves at least 90% precision on every reported type', () => {
    for (const typeScore of score.byType) {
      if (typeScore.reported === 0) continue;
      expect(
        typeScore.precision,
        `${typeScore.type}: ${typeScore.correct} of ${typeScore.reported} reports justified`,
      ).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('matches the overwhelming majority of records', () => {
    // Sanity bound on the headline figure. Deliberately not treated as a
    // correctness metric — an engine matching everything to anything scores 1.
    expect(score.matchRate).toBeGreaterThan(0.9);
  });

  it('claims most matches on the strongest tier', () => {
    expect(result.stats.matchesByTier.EXACT_REF).toBeGreaterThan(
      result.stats.matchesByTier.FUZZY_REF,
    );
  });

  it('exercises every matching tier', () => {
    // A regression guard, not a behavioural assertion. The suite once passed
    // with two of the four tiers never executing, because the fixtures always
    // agreed on references and tier 1 claimed everything. Green tests over
    // untested code are worse than no tests, so the coverage is pinned here.
    for (const [tier, count] of Object.entries(result.stats.matchesByTier)) {
      expect(count, `tier ${tier} claimed no matches`).toBeGreaterThan(0);
    }
  });

  it('absorbs a sub-tolerance rounding difference without reporting it', () => {
    // The re-keyed pairs differ by ₹0.50, below the ₹1.00 tolerance floor.
    // Reporting those would be a false exception.
    const fuzzyMatches = result.matches.filter((match) => match.tier === 'FUZZY_REF');
    expect(fuzzyMatches.length).toBeGreaterThan(0);
    for (const match of fuzzyMatches) {
      const flagged = result.exceptions.some(
        (exception) =>
          exception.type === 'AMOUNT_MISMATCH' &&
          match.sourceRecordIds.some((id) => exception.sourceRecordIds.includes(id)),
      );
      expect(flagged).toBe(false);
    }
  });
});

describe('bank reconciliation', () => {
  const dataset = generateBankDataset();
  const result = run(dataset);
  const score = scoreAgainstGroundTruth(result, dataset.manifest);

  it('reports zero false matches', () => {
    expect(score.falseMatches).toEqual([]);
  });

  it('achieves at least 95% recall on every planted type', () => {
    for (const typeScore of score.byType) {
      if (typeScore.planted === 0) continue;
      expect(
        typeScore.recall,
        `${typeScore.type}: found ${typeScore.correct} of ${typeScore.planted}`,
      ).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('never raises FEE_VARIANCE, which is settlement-only', () => {
    // FR-8.4. The bank domain has no gross/fees/net identity to verify.
    expect(result.exceptions.some((exception) => exception.type === 'FEE_VARIANCE')).toBe(false);
  });
});

describe('determinism', () => {
  it('produces byte-identical output across runs', () => {
    // NFR-1.4. A reconciliation that changes its answer between runs cannot be
    // signed off.
    const dataset = generateSettlementDataset();
    expect(stableStringify(run(dataset))).toBe(stableStringify(run(dataset)));
  });

  it('is unaffected by the order records arrive in', () => {
    const dataset = generateSettlementDataset();
    const reversed = run({
      ...dataset,
      source: [...dataset.source].reverse(),
      ledger: [...dataset.ledger].reverse(),
    });
    const forward = run(dataset);
    // Ordering may permute the output, but the findings themselves must agree.
    expect(reversed.stats.matchedCount).toBe(forward.stats.matchedCount);
    expect(reversed.stats.exceptionCount).toBe(forward.stats.exceptionCount);
  });
});

describe('the showcase discrepancy', () => {
  const dataset = generateSettlementDataset();
  const result = run(dataset);
  const source = dataset.source.find((record) => record.externalRef === SHOWCASE_ORDER_REF);

  it('is reported as an amount mismatch, not as two unmatched records', () => {
    // Without residue analysis these would surface as UNMATCHED_SOURCE plus
    // UNMATCHED_LEDGER, losing the information that makes it actionable.
    const exception = result.exceptions.find(
      (item) => source !== undefined && item.sourceRecordIds.includes(source.id),
    );
    expect(exception?.type).toBe('AMOUNT_MISMATCH');
  });

  it('names the unrecorded refund in plain English', () => {
    // Quoted in the README demo script, so the wording is load-bearing.
    const exception = result.exceptions.find(
      (item) => source !== undefined && item.sourceRecordIds.includes(source.id),
    );
    expect(exception?.statedReason).toContain('refund');
    expect(exception?.statedReason).toContain('₹412.00');
  });

  it('carries a settlement breakdown the agent can quote', () => {
    const exception = result.exceptions.find(
      (item) => source !== undefined && item.sourceRecordIds.includes(source.id),
    );
    const labels = exception?.evidence.map((line) => line.label) ?? [];
    expect(labels).toContain('Refunds');
    expect(labels).toContain('Net');
  });
});

describe('advisory exceptions accompany their match', () => {
  const dataset = generateSettlementDataset();
  const result = run(dataset);

  it('still matches records flagged with a timing difference', () => {
    // The money is accounted for; it simply moved on a different day. This is
    // why TIMING_DIFFERENCE is low severity.
    const timing = result.exceptions.filter((item) => item.type === 'TIMING_DIFFERENCE');
    expect(timing.length).toBeGreaterThan(0);
    for (const exception of timing) {
      const matched = result.matches.some((match) =>
        match.sourceRecordIds.some((id) => exception.sourceRecordIds.includes(id)),
      );
      expect(matched).toBe(true);
    }
  });

  it('still matches records flagged as a partial payment', () => {
    const partial = result.exceptions.filter((item) => item.type === 'PARTIAL_PAYMENT');
    expect(partial.length).toBeGreaterThan(0);
    for (const exception of partial) {
      const matched = result.matches.some((match) => match.tier === 'PARTIAL_SET');
      expect(matched).toBe(true);
    }
  });
});

describe('exception ordering', () => {
  it('surfaces high severity before low', () => {
    const dataset = generateSettlementDataset();
    const { exceptions } = run(dataset);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let index = 1; index < exceptions.length; index += 1) {
      const previous = exceptions[index - 1];
      const current = exceptions[index];
      if (previous === undefined || current === undefined) continue;
      expect(rank[previous.severity]).toBeLessThanOrEqual(rank[current.severity]);
    }
  });
});

describe('performance', () => {
  it('reconciles 1,000 pairs in under five seconds', () => {
    // NFR-3.1. The bound that forced the partial-set search to narrow its
    // candidate pool before enumerating combinations.
    const dataset = generateSettlementDataset({
      ...DEFAULT_SETTLEMENT_OPTIONS,
      pairCount: 1000,
    });
    const started = performance.now();
    run(dataset);
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it('reconciles 1,000 bank pairs in under five seconds', () => {
    const dataset = generateBankDataset({ ...DEFAULT_BANK_OPTIONS, pairCount: 1000 });
    const started = performance.now();
    run(dataset);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
