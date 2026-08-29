/**
 * Prints the engine scorecard for both domains.
 *
 * A temporary verification aid: green assertions alone cannot distinguish
 * "recall is 1.00 because everything was found" from "recall is 1.00 because
 * nothing was planted". This prints the underlying counts.
 */
import { generateBankDataset } from '../src/core/generate/bank';
import type { GeneratedDataset } from '../src/core/generate/manifest';
import { generateSettlementDataset } from '../src/core/generate/settlement';
import { reconcile } from '../src/core/reconcile/engine';
import { DEFAULT_RECON_PARAMS } from '../src/core/reconcile/config';
import { scoreAgainstGroundTruth } from '../src/core/score';

function report(dataset: GeneratedDataset): void {
  const result = reconcile({
    domain: dataset.domain,
    source: dataset.source,
    ledger: dataset.ledger,
    params: DEFAULT_RECON_PARAMS,
  });
  const score = scoreAgainstGroundTruth(result, dataset.manifest);

  process.stdout.write(`\n=== ${dataset.domain.toUpperCase()} ===\n`);
  process.stdout.write(
    `match rate ${(score.matchRate * 100).toFixed(1)}% ` +
      `(${result.stats.matchedCount}/${result.stats.sourceCount})  ` +
      `false matches: ${score.falseMatches.length}\n`,
  );
  process.stdout.write(
    `tiers: ${Object.entries(result.stats.matchesByTier)
      .map(([tier, count]) => `${tier}=${count}`)
      .join('  ')}\n`,
  );
  process.stdout.write('type                        planted reported correct  prec  recall\n');
  for (const s of score.byType) {
    if (s.planted === 0 && s.reported === 0) continue;
    process.stdout.write(
      `${s.type.padEnd(26)} ${String(s.planted).padStart(7)} ${String(s.reported).padStart(8)} ` +
        `${String(s.correct).padStart(7)}  ${s.precision.toFixed(2)}   ${s.recall.toFixed(2)}\n`,
    );
  }
}

report(generateSettlementDataset());
report(generateBankDataset());
