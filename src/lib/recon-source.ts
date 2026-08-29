/**
 * Supabase-backed data source for the Q&A agent.
 *
 * Mirrors `src/ai/fixture-source.ts` shape for shape. That correspondence is
 * deliberate: grounding is verified against the fixture source with the real
 * model, and the verification only transfers if production returns the same
 * shapes.
 *
 * Every query here is a read, scoped to one run. There is no method that writes
 * and none that computes — the agent can only report what the deterministic
 * engine already decided.
 *
 * @see docs/ARCHITECTURE.md §1
 * @module
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReconDataSource } from '@/ai/agent-tools';
import { formatMinor, toMinor } from '@/core/money';
import type { SettlementDetail } from '@/core/types';
import { decodeFromJsonb, readMinorColumn } from './serialize';

/** How many rows a search returns. Enough to answer, small enough to stay readable. */
const SEARCH_LIMIT = 10;

/** An evidence line as stored. */
interface StoredEvidence {
  readonly label: string;
  readonly sourceMinor?: bigint;
  readonly ledgerMinor?: bigint;
  readonly note?: string;
}

/**
 * Builds a read-only data source over one reconciliation run.
 *
 * @param client - Supabase client bound to the signed-in user's session, so RLS
 *   scopes every read to their own data.
 * @param runId - The run being discussed.
 * @param datasetId - The dataset the run belongs to.
 */
export function createSupabaseDataSource(
  client: SupabaseClient,
  runId: string,
  datasetId: string,
): ReconDataSource {
  /** Formats a stored evidence array for the model. */
  const presentEvidence = (raw: unknown): Record<string, string>[] => {
    const lines = (decodeFromJsonb(raw) ?? []) as StoredEvidence[];
    return lines.map((line) => ({
      label: line.label,
      ...(line.sourceMinor === undefined
        ? {}
        : { source: formatMinor(toMinor(line.sourceMinor)) }),
      ...(line.ledgerMinor === undefined
        ? {}
        : { ledger: formatMinor(toMinor(line.ledgerMinor)) }),
      ...(line.note === undefined ? {} : { note: line.note }),
    }));
  };

  /** Resolves record ids to their external references. */
  const referencesFor = async (ids: readonly string[]): Promise<string> => {
    if (ids.length === 0) return '';
    const [{ data: sources }, { data: ledgers }] = await Promise.all([
      client.from('source_records').select('external_ref').in('id', ids).limit(1),
      client.from('ledger_entries').select('external_ref').in('id', ids).limit(1),
    ]);
    const row = [...(sources ?? []), ...(ledgers ?? [])][0] as
      | { external_ref: string }
      | undefined;
    return row?.external_ref ?? '';
  };

  return {
    async getReconciliationSummary() {
      const [{ data: run }, { data: exceptions }, { data: matches }] = await Promise.all([
        client
          .from('recon_runs')
          .select('match_rate, source_count, ledger_count, matched_count, exception_count')
          .eq('id', runId)
          .maybeSingle(),
        client.from('exceptions').select('type, severity').eq('recon_run_id', runId),
        client.from('matches').select('tier').eq('recon_run_id', runId),
      ]);

      if (run === null) return { error: 'That reconciliation run was not found.' };
      const summary = run as {
        match_rate: number;
        source_count: number;
        ledger_count: number;
        matched_count: number;
        exception_count: number;
      };

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      for (const row of (exceptions ?? []) as { type: string; severity: string }[]) {
        byType[row.type] = (byType[row.type] ?? 0) + 1;
        bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
      }
      const byTier: Record<string, number> = {};
      for (const row of (matches ?? []) as { tier: string }[]) {
        byTier[row.tier] = (byTier[row.tier] ?? 0) + 1;
      }

      return {
        matchRate: `${(summary.match_rate * 100).toFixed(1)}%`,
        sourceRecords: summary.source_count,
        ledgerRecords: summary.ledger_count,
        matchedRecords: summary.matched_count,
        exceptions: summary.exception_count,
        matchesByTier: byTier,
        exceptionsByType: byType,
        exceptionsBySeverity: bySeverity,
        severityMeaning: {
          high: 'Money is unaccounted for.',
          medium: 'A human decision is required.',
          low: 'The discrepancy is explained — the money is accounted for.',
        },
      };
    },

    async getExceptionDetail(exceptionId: string) {
      const { data } = await client
        .from('exceptions')
        .select(
          'id, type, severity, stated_reason, evidence, suggested_action, source_record_ids, ledger_entry_ids',
        )
        .eq('id', exceptionId)
        .eq('recon_run_id', runId)
        .maybeSingle();

      if (data === null) return { error: `No exception with id "${exceptionId}" in this run.` };
      const row = data as {
        id: string;
        type: string;
        severity: string;
        stated_reason: string;
        evidence: unknown;
        suggested_action: string | null;
        source_record_ids: string[];
        ledger_entry_ids: string[];
      };

      return {
        id: row.id,
        type: row.type,
        severity: row.severity,
        reference: await referencesFor([...row.source_record_ids, ...row.ledger_entry_ids]),
        statedReason: row.stated_reason,
        evidence: presentEvidence(row.evidence),
        suggestedAction: row.suggested_action,
      };
    },

    async getSettlementBreakdown(reference: string) {
      const present = (row: unknown) => {
        if (row === null || row === undefined) return null;
        const record = row as {
          external_ref: string;
          txn_date: string;
          amount_minor: string | number;
          detail: unknown;
        };
        const detail = decodeFromJsonb(record.detail) as SettlementDetail;
        if (detail?.kind !== 'settlement') return null;
        return {
          reference: record.external_ref,
          date: record.txn_date,
          gross: formatMinor(toMinor(detail.grossMinor)),
          fees: formatMinor(toMinor(detail.feesMinor)),
          feeLines: detail.feeLines.map((line) => ({
            label: line.label,
            amount: formatMinor(toMinor(line.amountMinor)),
          })),
          refunds: formatMinor(toMinor(detail.refundsMinor)),
          chargebacks: formatMinor(toMinor(detail.chargebacksMinor)),
          net: formatMinor(readMinorColumn(record.amount_minor)),
        };
      };

      const columns = 'external_ref, txn_date, amount_minor, detail';
      const [{ data: source }, { data: ledger }] = await Promise.all([
        client
          .from('source_records')
          .select(columns)
          .eq('dataset_id', datasetId)
          .ilike('external_ref', reference.trim())
          .maybeSingle(),
        client
          .from('ledger_entries')
          .select(columns)
          .eq('dataset_id', datasetId)
          .ilike('external_ref', reference.trim())
          .maybeSingle(),
      ]);

      const sourceSide = present(source);
      const ledgerSide = present(ledger);
      if (sourceSide === null && ledgerSide === null) {
        return { error: `No settlement record found for "${reference}".` };
      }
      return { source: sourceSide, ledger: ledgerSide };
    },

    async findRecords(query: string) {
      const needle = query.trim();
      if (needle.length === 0) return { error: 'A search term is required.' };

      const columns = 'id, external_ref, txn_date, amount_minor';
      const [{ data: sources }, { data: ledgers }, { data: exceptions }] = await Promise.all([
        client
          .from('source_records')
          .select(columns)
          .eq('dataset_id', datasetId)
          .ilike('external_ref', `%${needle}%`)
          .limit(SEARCH_LIMIT),
        client
          .from('ledger_entries')
          .select(columns)
          .eq('dataset_id', datasetId)
          .ilike('external_ref', `%${needle}%`)
          .limit(SEARCH_LIMIT),
        client
          .from('exceptions')
          .select('id, type, severity, stated_reason')
          .eq('recon_run_id', runId)
          .ilike('stated_reason', `%${needle}%`)
          .limit(SEARCH_LIMIT),
      ]);

      const asRecord = (side: 'source' | 'ledger') => (row: unknown) => {
        const record = row as {
          id: string;
          external_ref: string;
          txn_date: string;
          amount_minor: string | number;
        };
        return {
          id: record.id,
          side,
          reference: record.external_ref,
          date: record.txn_date,
          amount: formatMinor(readMinorColumn(record.amount_minor)),
        };
      };

      return {
        records: [
          ...(sources ?? []).map(asRecord('source')),
          ...(ledgers ?? []).map(asRecord('ledger')),
        ],
        exceptions: (exceptions ?? []) as unknown[],
      };
    },
  };
}
