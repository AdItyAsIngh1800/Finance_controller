/**
 * Scores Stage 1 extraction against known-correct documents.
 *
 * The documents were rendered from records whose values are already known, so
 * accuracy here is measured rather than eyeballed.
 *
 * The second table is the more important one. Field accuracy tells you how
 * often the model is right; **calibration** tells you whether it knows when it
 * is not — and the confidence gate is only worth having if confidence actually
 * falls on a bad scan. A model that is 95% accurate with flat confidence is
 * less useful here than one that is 85% accurate and reliably flags its own
 * failures.
 *
 * Usage: `npm run extraction:report`
 *
 * @see docs/EVALUATION.md §3.4 — extraction accuracy and confidence calibration
 * @module
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIDENCE_THRESHOLD, extractSettlementDocument } from '../src/ai/extract';

const DOCUMENTS_DIR = join('fixtures', 'documents');

/** Loads `.env.local` into `process.env`; tsx does not do this on its own. */
function loadEnv(): void {
  if (!existsSync('.env.local')) throw new Error('.env.local not found.');
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined) {
      process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
}

/** One document's expected values, as written by the renderer. */
interface Expected {
  readonly reference: string;
  readonly date: string;
  readonly netMinor: string;
  readonly detail: { readonly grossMinor: string; readonly netMinor: string };
}

/** Normalises an amount string for comparison: "₹1,250.00" and "1250.0" agree. */
function sameAmount(extracted: string, expectedMinor: string): boolean {
  const digits = extracted.replace(/[^0-9.]/g, '');
  if (digits.length === 0) return false;
  const [whole = '0', fraction = ''] = digits.split('.');
  const minor = `${whole}${fraction.padEnd(2, '0').slice(0, 2)}`;
  return BigInt(minor).toString() === BigInt(expectedMinor).toString();
}

async function main(): Promise<void> {
  loadEnv();

  if (!existsSync(join(DOCUMENTS_DIR, 'expected.json'))) {
    throw new Error(`No documents found. Run \`npm run render:documents\` first.`);
  }
  const expected = JSON.parse(
    readFileSync(join(DOCUMENTS_DIR, 'expected.json'), 'utf8'),
  ) as Expected[];

  const files = readdirSync(DOCUMENTS_DIR);
  const rows: {
    document: string;
    quality: 'clean' | 'degraded';
    reference: boolean;
    date: boolean;
    net: boolean;
    minConfidence: number | null;
    status: string;
  }[] = [];

  for (const record of expected) {
    const pdf = join(DOCUMENTS_DIR, `${record.reference}.pdf`);
    if (!existsSync(pdf)) continue;

    const outcome = await extractSettlementDocument({
      data: readFileSync(pdf),
      mimeType: 'application/pdf',
    });

    rows.push({
      document: record.reference,
      quality: 'clean',
      reference: outcome.fields.reference?.value === record.reference,
      date: outcome.fields.date?.value === record.date,
      net: sameAmount(outcome.fields.net?.value ?? '', record.netMinor),
      minConfidence: outcome.minConfidence,
      status: outcome.status === 'failed' ? `failed: ${outcome.error ?? ''}` : outcome.status,
    });
  }

  // The degraded variant: the document the gate must catch.
  const degraded = files.find((name) => name.endsWith('.degraded.jpg'));
  if (degraded !== undefined) {
    const reference = degraded.replace('.degraded.jpg', '');
    const truth = expected.find((item) => item.reference === reference);
    const outcome = await extractSettlementDocument({
      data: readFileSync(join(DOCUMENTS_DIR, degraded)),
      mimeType: 'image/jpeg',
    });
    rows.push({
      document: reference,
      quality: 'degraded',
      reference: outcome.fields.reference?.value === truth?.reference,
      date: outcome.fields.date?.value === truth?.date,
      net: sameAmount(outcome.fields.net?.value ?? '', truth?.netMinor ?? '-1'),
      minConfidence: outcome.minConfidence,
      status: outcome.status === 'failed' ? `failed: ${outcome.error ?? ''}` : outcome.status,
    });
  }

  const tick = (ok: boolean): string => (ok ? ' ok ' : 'MISS');
  process.stdout.write('\ndocument      quality   ref  date  net   min conf  status\n');
  for (const row of rows) {
    process.stdout.write(
      `${row.document.padEnd(13)} ${row.quality.padEnd(9)} ${tick(row.reference)} ${tick(
        row.date,
      )} ${tick(row.net)}  ${(row.minConfidence ?? 0).toFixed(2).padStart(7)}  ${row.status}\n`,
    );
  }

  const clean = rows.filter((row) => row.quality === 'clean');
  const bad = rows.filter((row) => row.quality === 'degraded');
  const accuracy = (set: typeof rows): string => {
    const total = set.length * 3;
    if (total === 0) return 'n/a';
    const hits = set.reduce(
      (count, row) => count + Number(row.reference) + Number(row.date) + Number(row.net),
      0,
    );
    return `${((hits / total) * 100).toFixed(0)}% (${hits}/${total})`;
  };

  const cleanConf = clean.map((row) => row.minConfidence ?? 0);
  const badConf = bad.map((row) => row.minConfidence ?? 0);
  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  process.stdout.write(
    `\nfield accuracy   clean ${accuracy(clean)}   degraded ${accuracy(bad)}\n` +
      `mean confidence  clean ${mean(cleanConf).toFixed(2)}   degraded ${mean(badConf).toFixed(2)}\n` +
      `threshold        ${CONFIDENCE_THRESHOLD}\n` +
      `gate works       ${
        bad.length === 0
          ? 'no degraded document rendered'
          : bad.every((row) => row.status === 'needs_review')
            ? 'YES — every degraded document was quarantined'
            : 'NO — a degraded document passed the gate'
      }\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
