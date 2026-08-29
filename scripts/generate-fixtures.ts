/**
 * Fixture generation CLI.
 *
 * Writes both domains' datasets to `fixtures/`, as domain-native CSVs plus the
 * ground-truth manifest that scoring depends on.
 *
 * Fixtures are gitignored rather than committed, so this script is the only
 * source of the data every accuracy claim rests on. That makes its determinism
 * load-bearing: re-running it must reproduce byte-identical files, which
 * `src/core/generate/generate.test.ts` asserts.
 *
 * Usage: `npm run generate:fixtures`
 *
 * @see docs/EVALUATION.md §2 — ground-truth methodology
 * @module
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateBankDataset } from '../src/core/generate/bank';
import { recordsToCsv } from '../src/core/generate/csv';
import type { GeneratedDataset } from '../src/core/generate/manifest';
import { generateSettlementDataset } from '../src/core/generate/settlement';

/** Directory receiving generated fixtures, relative to the repository root. */
const FIXTURES_ROOT = 'fixtures';

/**
 * Writes one dataset to `fixtures/<domain>/`.
 *
 * @param dataset - The generated dataset and its manifest.
 * @returns A one-line summary for the console.
 */
function writeDataset(dataset: GeneratedDataset): string {
  const directory = join(FIXTURES_ROOT, dataset.domain);
  mkdirSync(directory, { recursive: true });

  writeFileSync(join(directory, 'source.csv'), recordsToCsv(dataset.domain, dataset.source), 'utf8');
  writeFileSync(join(directory, 'ledger.csv'), recordsToCsv(dataset.domain, dataset.ledger), 'utf8');
  // Two-space indentation keeps the manifest readable when someone inspects
  // what the system was actually tested against.
  writeFileSync(
    join(directory, 'ground-truth.json'),
    `${JSON.stringify(dataset.manifest, null, 2)}\n`,
    'utf8',
  );

  const { planted, cleanPairs } = dataset.manifest;
  return (
    `${dataset.domain.padEnd(11)} ` +
    `${String(dataset.source.length).padStart(4)} source · ` +
    `${String(dataset.ledger.length).padStart(4)} ledger · ` +
    `${String(planted.length).padStart(2)} planted · ` +
    `${String(cleanPairs.length).padStart(4)} clean pairs`
  );
}

const summaries = [
  writeDataset(generateSettlementDataset()),
  writeDataset(generateBankDataset()),
];

process.stdout.write(`Fixtures written to ${FIXTURES_ROOT}/\n${summaries.join('\n')}\n`);
