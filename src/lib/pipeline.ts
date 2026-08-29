/**
 * Ingestion and reconciliation, between the pure core and the HTTP layer.
 *
 * The reconciliation engine itself stays untouched by any of this: it is handed
 * plain records and returns plain results. Everything database-shaped lives
 * here, which is what keeps `src/core/` free of a client and testable without
 * mocks.
 *
 * @see docs/ARCHITECTURE.md §5 — data flow
 * @module
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseBankCsv } from '@/core/adapters/bank';
import { parseSettlementCsv } from '@/core/adapters/settlement';
import { isIsoDate } from '@/core/dates';
import { parseMinor } from '@/core/money';
import { normalizeRef } from '@/core/refs';
import type { AdapterResult, RowError } from '@/core/adapters/types';
import { DEFAULT_RECON_PARAMS } from '@/core/reconcile/config';
import { reconcile } from '@/core/reconcile/engine';
import type {
  Domain,
  NormalizedRecord,
  RecordDetail,
  RecordSide,
  ReconResult,
  SettlementDetail,
} from '@/core/types';
import { decodeFromJsonb, encodeForJsonb, readMinorColumn } from './serialize';

/** Rows are written in batches so a large upload does not exceed request limits. */
const INSERT_BATCH_SIZE = 500;

/** Which table holds a given side of a dataset. */
function tableForSide(side: RecordSide): 'source_records' | 'ledger_entries' {
  return side === 'source' ? 'source_records' : 'ledger_entries';
}

/**
 * Parses an uploaded file using the adapter for its domain.
 *
 * @throws {Error} If the domain has no adapter yet.
 */
function parseForDomain(domain: Domain, text: string, side: RecordSide): AdapterResult {
  switch (domain) {
    case 'settlement':
      return parseSettlementCsv(text, side);
    case 'bank':
      return parseBankCsv(text, side);
  }
}

/** The outcome of an ingestion attempt. */
export interface IngestResult {
  /** How many records were written. Zero when the upload was rejected. */
  readonly inserted: number;
  /** Row-level problems. Non-empty means nothing was written. */
  readonly errors: readonly RowError[];
}

/**
 * Replaces one side of a dataset with the contents of an uploaded CSV.
 *
 * Two deliberate behaviours:
 *
 * **Rejection is all-or-nothing.** A single malformed row rejects the whole
 * file. Partial ingestion is worse than none here — a ledger missing rows
 * reconciles into a pile of spurious unmatched exceptions that are
 * indistinguishable from real findings.
 *
 * **Uploading replaces rather than appends.** This makes re-uploading the same
 * file idempotent by construction, without needing to hash contents to detect a
 * repeat, and it matches what a user means by "upload my ledger".
 *
 * @param client - Supabase client bound to the signed-in user's session.
 * @param options - Dataset, side, domain, owner, and file contents.
 * @returns How many records were written, or the errors that prevented it.
 */
export async function ingestCsv(
  client: SupabaseClient,
  options: {
    readonly datasetId: string;
    readonly userId: string;
    readonly domain: Domain;
    readonly side: RecordSide;
    readonly text: string;
  },
): Promise<IngestResult> {
  const { datasetId, userId, domain, side, text } = options;
  const parsed = parseForDomain(domain, text, side);

  if (parsed.errors.length > 0) {
    return { inserted: 0, errors: parsed.errors };
  }
  if (parsed.records.length === 0) {
    return { inserted: 0, errors: [{ lineNumber: 1, reason: 'file contains no data rows' }] };
  }

  const table = tableForSide(side);

  // Replace: clear this side before writing. Scoped to the dataset, and RLS
  // scopes it to the user on top of that.
  const { error: deleteError } = await client.from(table).delete().eq('dataset_id', datasetId);
  if (deleteError !== null) {
    throw new Error(`Could not clear existing ${side} records: ${deleteError.message}`);
  }

  const rows = parsed.records.map((record) => ({
    user_id: userId,
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
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const { error } = await client.from(table).insert(batch);
    if (error !== null) throw new Error(`Could not write ${side} records: ${error.message}`);
  }

  return { inserted: rows.length, errors: [] };
}

/** Shape of a persisted record row as read back for reconciliation. */
interface RecordRow {
  readonly id: string;
  readonly external_ref: string;
  readonly normalized_ref: string;
  readonly txn_date: string;
  readonly amount_minor: string | number;
  readonly description: string | null;
  readonly detail: unknown;
}

/**
 * Converts a persisted row into the shape the engine consumes.
 *
 * The database identifier becomes the record id, so every match and exception
 * the engine emits refers to rows that can be looked up again — which is what
 * lets the Q&A agent trace an answer back to real data.
 */
function toNormalizedRecord(row: RecordRow, side: RecordSide): NormalizedRecord {
  return {
    id: row.id,
    side,
    externalRef: row.external_ref,
    normalizedRef: row.normalized_ref,
    date: row.txn_date,
    amountMinor: readMinorColumn(row.amount_minor),
    description: row.description ?? '',
    detail: decodeFromJsonb(row.detail) as RecordDetail,
  };
}

/** Loads one side of a dataset. */
async function loadSide(
  client: SupabaseClient,
  datasetId: string,
  side: RecordSide,
): Promise<NormalizedRecord[]> {
  const { data, error } = await client
    .from(tableForSide(side))
    .select('id, external_ref, normalized_ref, txn_date, amount_minor, description, detail')
    .eq('dataset_id', datasetId)
    // Ordered so the engine sees records in a stable sequence; without this the
    // database is free to return rows in any order and output could vary
    // between runs on identical data.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error !== null) throw new Error(`Could not load ${side} records: ${error.message}`);
  return (data ?? []).map((row) => toNormalizedRecord(row as RecordRow, side));
}

/** A completed reconciliation run. */
export interface RunSummary {
  readonly runId: string;
  readonly result: ReconResult;
}

/**
 * Reconciles a dataset and persists the run.
 *
 * Runs are append-only: each execution writes a new `recon_runs` row rather than
 * updating the last, and the thresholds actually applied are snapshotted onto
 * it. A result therefore stays explicable months later, after someone has
 * retuned the defaults.
 *
 * @param client - Supabase client bound to the signed-in user's session.
 * @param options - Dataset, domain, and owner.
 * @returns The new run's id and the engine's result.
 */
export async function runReconciliation(
  client: SupabaseClient,
  options: { readonly datasetId: string; readonly userId: string; readonly domain: Domain },
): Promise<RunSummary> {
  const { datasetId, userId, domain } = options;

  const [source, ledger] = await Promise.all([
    loadSide(client, datasetId, 'source'),
    loadSide(client, datasetId, 'ledger'),
  ]);

  if (source.length === 0 && ledger.length === 0) {
    throw new Error('This dataset has no records to reconcile. Upload both sides first.');
  }

  const started = Date.now();
  const result = reconcile({ domain, source, ledger, params: DEFAULT_RECON_PARAMS });
  const durationMs = Date.now() - started;

  const { data: run, error: runError } = await client
    .from('recon_runs')
    .insert({
      user_id: userId,
      dataset_id: datasetId,
      params: encodeForJsonb(result.params),
      source_count: result.stats.sourceCount,
      ledger_count: result.stats.ledgerCount,
      matched_count: result.stats.matchedCount,
      exception_count: result.stats.exceptionCount,
      match_rate: result.stats.matchRate,
      duration_ms: durationMs,
    })
    .select('id')
    .single();

  if (runError !== null || run === null) {
    throw new Error(`Could not record the run: ${runError?.message ?? 'no row returned'}`);
  }

  const runId = (run as { id: string }).id;

  const matchRows = result.matches.map((match) => ({
    user_id: userId,
    recon_run_id: runId,
    source_record_ids: match.sourceRecordIds,
    ledger_entry_ids: match.ledgerEntryIds,
    tier: match.tier,
    amount_delta_minor: match.amountDeltaMinor.toString(),
    day_delta: match.dayDelta,
    rationale: match.rationale,
  }));

  const exceptionRows = result.exceptions.map((exception) => ({
    user_id: userId,
    recon_run_id: runId,
    type: exception.type,
    severity: exception.severity,
    source_record_ids: exception.sourceRecordIds,
    ledger_entry_ids: exception.ledgerEntryIds,
    stated_reason: exception.statedReason,
    evidence: encodeForJsonb(exception.evidence),
    suggested_action: exception.suggestedAction ?? null,
  }));

  for (let start = 0; start < matchRows.length; start += INSERT_BATCH_SIZE) {
    const { error } = await client
      .from('matches')
      .insert(matchRows.slice(start, start + INSERT_BATCH_SIZE));
    if (error !== null) throw new Error(`Could not write matches: ${error.message}`);
  }

  for (let start = 0; start < exceptionRows.length; start += INSERT_BATCH_SIZE) {
    const { error } = await client
      .from('exceptions')
      .insert(exceptionRows.slice(start, start + INSERT_BATCH_SIZE));
    if (error !== null) throw new Error(`Could not write exceptions: ${error.message}`);
  }

  return { runId, result };
}

/**
 * Promotes a reviewed extraction into a ledger record.
 *
 * This is the only path by which extracted data enters reconciliation, and it
 * refuses to run unless a human has confirmed the extraction. That refusal is
 * the confidence gate expressed as control flow rather than as a warning label:
 * a low-confidence reading cannot reach the engine even if something else in
 * the application asks for it.
 *
 * Amounts are re-parsed here with `parseMinor` rather than trusted as read. The
 * model returns strings; this is where they become money, and anything that
 * cannot be represented exactly is rejected rather than rounded.
 *
 * @param client - Supabase client bound to the signed-in user's session.
 * @param options - The extraction to promote, and where it belongs.
 * @returns The id of the created record.
 * @throws {Error} If the extraction is absent, unconfirmed, or unparseable.
 */
export async function promoteExtraction(
  client: SupabaseClient,
  options: {
    readonly extractionId: string;
    readonly datasetId: string;
    readonly userId: string;
    readonly side: RecordSide;
    /** Field values as confirmed by the reviewer, which may differ from the model's. */
    readonly confirmed: Readonly<Record<string, string>>;
  },
): Promise<string> {
  const { extractionId, datasetId, userId, side, confirmed } = options;

  const { data: extraction, error: readError } = await client
    .from('extractions')
    .select('id, status')
    .eq('id', extractionId)
    .maybeSingle();

  if (readError !== null) throw new Error(`Could not read the extraction: ${readError.message}`);
  if (extraction === null) throw new Error('Extraction not found.');

  // The detail payload built below is a SettlementDetail. Checked here as well
  // as at the endpoint because this function is the only path into the ledger,
  // and a guard on the sole entrance is worth more than one on the doorbell.
  const { data: dataset } = await client
    .from('datasets')
    .select('domain')
    .eq('id', datasetId)
    .maybeSingle();
  if (dataset === null) throw new Error('Dataset not found.');
  if ((dataset as { domain: string }).domain !== 'settlement') {
    throw new Error(
      'Extractions can only be promoted into a settlement dataset. ' +
        'Bank records are ingested as CSV.',
    );
  }

  const reference = (confirmed.reference ?? '').trim();
  if (reference.length === 0) throw new Error('A reference is required.');

  const date = (confirmed.date ?? '').trim();
  if (!isIsoDate(date)) throw new Error(`"${date}" is not a valid YYYY-MM-DD date.`);

  // Throws MoneyParseError on anything inexact — excess precision included.
  const grossMinor = parseMinor(confirmed.gross ?? '0');
  const feesMinor = parseMinor(confirmed.fees ?? '0');
  const refundsMinor = parseMinor(confirmed.refunds ?? '0');
  const chargebacksMinor = parseMinor(confirmed.chargebacks ?? '0');
  const netMinor = parseMinor(confirmed.net ?? '0');

  const detail: SettlementDetail = {
    kind: 'settlement',
    grossMinor,
    feesMinor,
    refundsMinor,
    chargebacksMinor,
    netMinor,
    // The statement states a fee total but does not always itemise it. An empty
    // list is honest; inventing line items to fill it would be fabrication.
    feeLines: [],
  };

  const { data: inserted, error: insertError } = await client
    .from(tableForSide(side))
    .insert({
      user_id: userId,
      dataset_id: datasetId,
      external_ref: reference,
      normalized_ref: normalizeRef(reference),
      txn_date: date,
      amount_minor: netMinor.toString(),
      description: `Extracted from document`,
      detail: encodeForJsonb(detail),
      origin: 'extraction',
      extraction_id: extractionId,
    })
    .select('id')
    .single();

  if (insertError !== null || inserted === null) {
    throw new Error(`Could not create the record: ${insertError?.message ?? 'no row returned'}`);
  }

  const { error: statusError } = await client
    .from('extractions')
    .update({ status: 'confirmed' })
    .eq('id', extractionId);
  if (statusError !== null) {
    throw new Error(`Record created but the extraction status was not updated: ${statusError.message}`);
  }

  return (inserted as { id: string }).id;
}
