/**
 * Seeds a fully-populated demo dataset for the signed-in user.
 *
 * Exists because a demonstration must not depend on a live upload — or a live
 * model call — succeeding at the moment someone is watching. One request
 * creates a dataset, loads both sides, and reconciles, so the walkthrough can
 * begin from results rather than from an upload dialog.
 *
 * Records are generated **in process**, not read from `fixtures/`: that
 * directory is gitignored and does not exist in a deployment. The generators
 * are seeded and pure, so the demo data is identical to what the test suite and
 * the evaluation page score against.
 *
 * There is deliberately no service-role key in this project, so seeding runs as
 * the signed-in user and their RLS policies apply exactly as they would to any
 * other data.
 *
 * @see docs/REQUIREMENTS.md NFR-4.3
 * @module
 */

import { NextResponse } from 'next/server';
import { generateBankDataset } from '@/core/generate/bank';
import { generateSettlementDataset } from '@/core/generate/settlement';
import type { GeneratedDataset } from '@/core/generate/manifest';
import { isDomain } from '@/core/taxonomy';
import type { Domain, NormalizedRecord } from '@/core/types';
import { runReconciliation } from '@/lib/pipeline';
import { encodeForJsonb } from '@/lib/serialize';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** Rows are written in batches so a large insert stays within request limits. */
const INSERT_BATCH_SIZE = 500;

/** Human-readable dataset names. */
const DATASET_NAMES: Readonly<Record<Domain, string>> = {
  settlement: 'Demo — processor settlements',
  bank: 'Demo — bank statement',
};

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let domain: Domain = 'settlement';
  try {
    const body = (await request.json()) as { domain?: unknown };
    if (isDomain(body.domain)) domain = body.domain;
  } catch {
    // No body is fine; settlement is the default demo path.
  }

  const dataset: GeneratedDataset =
    domain === 'settlement' ? generateSettlementDataset() : generateBankDataset();

  const client = await createClient();

  const { data: created, error: datasetError } = await client
    .from('datasets')
    .insert({ user_id: user.id, name: DATASET_NAMES[domain], domain })
    .select('id')
    .single();

  if (datasetError !== null || created === null) {
    return NextResponse.json(
      { error: `Could not create the dataset: ${datasetError?.message ?? 'no row returned'}` },
      { status: 500 },
    );
  }
  const datasetId = (created as { id: string }).id;

  /** Writes one side's records. */
  const insertSide = async (
    table: 'source_records' | 'ledger_entries',
    records: readonly NormalizedRecord[],
  ): Promise<string | null> => {
    const rows = records.map((record) => ({
      user_id: user.id,
      dataset_id: datasetId,
      external_ref: record.externalRef,
      normalized_ref: record.normalizedRef,
      txn_date: record.date,
      amount_minor: record.amountMinor.toString(),
      description: record.description,
      detail: encodeForJsonb(record.detail),
      origin: 'csv',
    }));

    for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
      const { error } = await client.from(table).insert(rows.slice(start, start + INSERT_BATCH_SIZE));
      if (error !== null) return error.message;
    }
    return null;
  };

  const sourceError = await insertSide('source_records', dataset.source);
  if (sourceError !== null) {
    return NextResponse.json({ error: `Could not seed records: ${sourceError}` }, { status: 500 });
  }
  const ledgerError = await insertSide('ledger_entries', dataset.ledger);
  if (ledgerError !== null) {
    return NextResponse.json({ error: `Could not seed records: ${ledgerError}` }, { status: 500 });
  }

  try {
    const { runId } = await runReconciliation(client, { datasetId, userId: user.id, domain });
    return NextResponse.json({
      datasetId,
      runId,
      sourceRecords: dataset.source.length,
      ledgerRecords: dataset.ledger.length,
      plantedDiscrepancies: dataset.manifest.planted.length,
    });
  } catch (cause) {
    // The dataset and its records exist; only the run failed. Say so precisely
    // rather than implying nothing happened.
    return NextResponse.json(
      {
        error: `Records were seeded but reconciliation failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        datasetId,
      },
      { status: 500 },
    );
  }
}
