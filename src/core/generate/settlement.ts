/**
 * Synthetic settlement dataset generator.
 *
 * Produces marketplace/processor payouts paired with an internal ledger, plants
 * a known set of discrepancies, and records exactly what it planted. The
 * manifest is what makes the engine's output scoreable rather than merely
 * plausible.
 *
 * Generation is fully deterministic: identical options produce byte-identical
 * output. Fixtures are gitignored rather than committed, so no diff exists to
 * reveal drift — determinism is instead pinned by a test.
 *
 * @see docs/EVALUATION.md §2.1 — generation procedure
 * @module
 */

import { addDays } from '../dates';
import { basisPointsOf, subMinor, sumMinor, toMinor, type Minor } from '../money';
import { normalizeRef } from '../refs';
import type { CleanPair, GeneratedDataset, GenerateOptions, PlantedDiscrepancy } from './manifest';
import type { FeeLine, NormalizedRecord, SettlementDetail } from '../types';
import { at, createIndexAllocator, plantGenericDiscrepancies, type WorkingPair } from './plant';
import { createRng } from './random';

/**
 * Order references run from `ORD-4401` upward.
 *
 * The base is chosen so `ORD-4471` — the reference quoted in the demo script and
 * throughout the documentation — exists in a default-sized dataset and carries
 * the showcase discrepancy.
 */
const ORDER_REF_BASE = 4400;

/** Reference of the order carrying the showcase "unrecorded refund" mismatch. */
export const SHOWCASE_ORDER_REF = 'ORD-4471';

/** Platform commission, in basis points of gross. */
const COMMISSION_BPS = 200;

/** Payment-gateway fee, in basis points of gross. */
const GATEWAY_BPS = 100;

/** Default generation options, sized for the demo dataset. */
export const DEFAULT_SETTLEMENT_OPTIONS: GenerateOptions = {
  seed: 20_260_904,
  pairCount: 250,
  startDate: '2026-07-01',
  plant: {
    unmatchedSource: 3,
    unmatchedLedger: 2,
    amountMismatch: 2,
    timingDifference: 5,
    duplicateSuspected: 2,
    partialPayment: 1,
    feeVariance: 1,
  },
};

/**
 * Builds the settlement detail payload for a payout.
 *
 * Fees derive from gross in integer basis points, and `net` is computed from the
 * identity the engine later verifies, so a freshly built record always balances.
 * `FEE_VARIANCE` is planted by breaking this identity afterwards.
 *
 * @param grossMinor - Total sale value before deductions.
 * @param refundsMinor - Refunds netted out of the payout.
 * @param chargebacksMinor - Chargebacks netted out of the payout.
 * @param orderRef - The originating order reference.
 * @returns A balanced settlement detail payload.
 */
function buildDetail(
  grossMinor: Minor,
  refundsMinor: Minor,
  chargebacksMinor: Minor,
  orderRef: string,
): SettlementDetail {
  const commission = basisPointsOf(grossMinor, COMMISSION_BPS);
  const gateway = basisPointsOf(grossMinor, GATEWAY_BPS);
  const feeLines: readonly FeeLine[] = [
    { label: 'Platform commission', amountMinor: commission },
    { label: 'Payment gateway', amountMinor: gateway },
  ];
  const feesMinor = sumMinor([commission, gateway]);
  const netMinor = subMinor(
    subMinor(subMinor(grossMinor, feesMinor), refundsMinor),
    chargebacksMinor,
  );

  return {
    kind: 'settlement',
    grossMinor,
    feesMinor,
    refundsMinor,
    chargebacksMinor,
    netMinor,
    orderRef,
    feeLines,
  };
}

/**
 * Generates a settlement dataset with planted, recorded discrepancies.
 *
 * @param options - Generation options; defaults to {@link DEFAULT_SETTLEMENT_OPTIONS}.
 * @returns Both sides of the dataset plus its ground-truth manifest.
 *
 * @example
 * const { source, ledger, manifest } = generateSettlementDataset();
 * manifest.planted.length; // known count of deliberate discrepancies
 */
export function generateSettlementDataset(
  options: GenerateOptions = DEFAULT_SETTLEMENT_OPTIONS,
): GeneratedDataset {
  const { seed, pairCount, startDate, plant } = options;
  const rng = createRng(seed);
  const planted: PlantedDiscrepancy[] = [];

  // --- 1. Clean pairs -----------------------------------------------------
  const pairs: WorkingPair[] = [];
  for (let index = 0; index < pairCount; index += 1) {
    const orderRef = `ORD-${ORDER_REF_BASE + index + 1}`;
    const saleDate = addDays(startDate, rng.int(0, 44));
    // Payouts settle nought to two days after the sale — inside the matching
    // window, so this variance is normal rather than a timing exception.
    const settleDate = addDays(saleDate, rng.int(0, 2));
    const detail = buildDetail(
      toMinor(BigInt(rng.int(20_000, 500_000))),
      toMinor(0n),
      toMinor(0n),
      orderRef,
    );
    const common = {
      externalRef: orderRef,
      normalizedRef: normalizeRef(orderRef),
      amountMinor: detail.netMinor,
      detail,
    };

    pairs.push({
      clean: true,
      sourceRecords: [
        {
          ...common,
          id: `s-${index}`,
          side: 'source',
          date: settleDate,
          description: `Payout for ${orderRef}`,
        },
      ],
      ledgerRecords: [
        {
          ...common,
          id: `l-${index}`,
          side: 'ledger',
          date: saleDate,
          description: `Expected payout for ${orderRef}`,
        },
      ],
    });
  }

  // --- 2. Showcase discrepancy: an unrecorded refund on ORD-4471 ----------
  // Fixed values rather than random ones, so the demo script and documentation
  // can quote a specific reference and figure that actually exist in the data.
  const showcaseIndex = 4471 - ORDER_REF_BASE - 1;
  const hasShowcase = showcaseIndex >= 0 && showcaseIndex < pairCount;
  if (hasShowcase) {
    const pair = at(pairs, showcaseIndex);
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    const grossMinor = toMinor(125_000n); // ₹1,250.00
    const refundsMinor = toMinor(41_200n); // ₹412.00, netted out by the processor
    const withRefund = buildDetail(grossMinor, refundsMinor, toMinor(0n), SHOWCASE_ORDER_REF);
    // The ledger recorded the sale but never the refund, so it still expects the
    // full post-fee amount — leaving the two sides exactly ₹412.00 apart.
    const withoutRefund = buildDetail(grossMinor, toMinor(0n), toMinor(0n), SHOWCASE_ORDER_REF);

    pair.sourceRecords = [{ ...source, amountMinor: withRefund.netMinor, detail: withRefund }];
    pair.ledgerRecords = [{ ...ledger, amountMinor: withoutRefund.netMinor, detail: withoutRefund }];
    pair.clean = false;

    planted.push({
      id: 'planted-showcase-amount-mismatch',
      type: 'AMOUNT_MISMATCH',
      sourceRecordIds: [source.id],
      ledgerEntryIds: [ledger.id],
      expectsMatch: false,
      note:
        `${SHOWCASE_ORDER_REF}: the processor netted a ₹412.00 refund out of the payout ` +
        `that the ledger never recorded, leaving the two sides ₹412.00 apart.`,
    });
  }

  // --- 3. Generic discrepancies ------------------------------------------
  const nextIndex = createIndexAllocator(rng, pairCount, hasShowcase ? [showcaseIndex] : []);
  planted.push(
    ...plantGenericDiscrepancies(
      pairs,
      rng,
      // The showcase already accounts for one amount mismatch.
      { ...plant, amountMismatch: Math.max(0, plant.amountMismatch - (hasShowcase ? 1 : 0)) },
      nextIndex,
    ),
  );

  // --- 4. Settlement-only: arithmetic that does not balance ---------------
  for (let n = 0; n < plant.feeVariance; n += 1) {
    const pair = at(pairs, nextIndex());
    const source = at(pair.sourceRecords, 0);
    const ledger = at(pair.ledgerRecords, 0);
    const detail = source.detail as SettlementDetail;
    // Overstate fees while leaving `net` untouched, so the record still matches
    // its counterpart on amount and only the internal identity breaks. This
    // isolates FEE_VARIANCE from AMOUNT_MISMATCH.
    const inflatedFees = sumMinor([detail.feesMinor, toMinor(BigInt(rng.int(1_000, 9_000)))]);
    pair.sourceRecords = [{ ...source, detail: { ...detail, feesMinor: inflatedFees } }];
    pair.clean = false;
    planted.push({
      id: `planted-fee-variance-${n}`,
      type: 'FEE_VARIANCE',
      sourceRecordIds: [source.id],
      ledgerEntryIds: [ledger.id],
      // Advisory: the payout still reconciles against the ledger; it is the
      // settlement's own gross/fees/net identity that fails.
      expectsMatch: true,
      note: 'Stated fees inflated without adjusting net, breaking the settlement identity.',
    });
  }

  // --- 5. Flatten and record ground truth ---------------------------------
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
    domain: 'settlement',
    source,
    ledger,
    manifest: { domain: 'settlement', seed, basePairCount: pairCount, planted, cleanPairs },
  };
}
