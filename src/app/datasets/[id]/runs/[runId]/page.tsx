/**
 * Reconciliation results — the dashboard and exception queue.
 *
 * The match rate is the headline a controller looks for first, but it is
 * deliberately not presented alone: the tier breakdown shows *how* records were
 * paired, and the parameters panel shows what thresholds produced the number. A
 * figure a user cannot interrogate is a figure they cannot sign off.
 *
 * @see docs/DESIGN.md §S-5, §S-6
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AskPanel } from '@/components/ask-panel';
import { ExceptionList, type ExceptionView } from '@/components/exception-list';
import { ReconciliationBar } from '@/components/reconciliation-bar';
import { formatMinor, toMinor } from '@/core/money';
import { MATCH_TIERS, type MatchTier, type Severity } from '@/core/taxonomy';
import { decodeFromJsonb } from '@/lib/serialize';
import { createClient } from '@/lib/supabase/server';

/** Human-readable name for each tier. */
const TIER_LABELS: Readonly<Record<MatchTier, string>> = {
  EXACT_REF: 'Exact reference',
  EXACT_AMOUNT_DATE: 'Amount and date',
  FUZZY_REF: 'Similar reference',
  PARTIAL_SET: 'Combined payments',
};

/** An exception row as stored. */
interface ExceptionRow {
  readonly id: string;
  readonly type: string;
  readonly severity: Severity;
  readonly source_record_ids: readonly string[];
  readonly ledger_entry_ids: readonly string[];
  readonly stated_reason: string;
  readonly evidence: unknown;
  readonly suggested_action: string | null;
}

/** Evidence as decoded from JSONB, before formatting. */
interface EvidenceLine {
  readonly label: string;
  readonly sourceMinor?: bigint;
  readonly ledgerMinor?: bigint;
  readonly note?: string;
}

export default async function RunPage({
  params,
}: {
  readonly params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const client = await createClient();

  const { data: run } = await client
    .from('recon_runs')
    .select('id, dataset_id, params, source_count, matched_count, exception_count, match_rate, duration_ms, created_at')
    .eq('id', runId)
    .maybeSingle();

  if (run === null) notFound();
  const summary = run as {
    source_count: number;
    matched_count: number;
    exception_count: number;
    match_rate: number;
    duration_ms: number;
    created_at: string;
    params: Record<string, unknown>;
  };

  const [{ data: dataset }, { data: matches }, { data: exceptionRows }] = await Promise.all([
    client.from('datasets').select('name, domain').eq('id', id).maybeSingle(),
    client.from('matches').select('tier').eq('recon_run_id', runId),
    client
      .from('exceptions')
      .select('id, type, severity, source_record_ids, ledger_entry_ids, stated_reason, evidence, suggested_action')
      .eq('recon_run_id', runId),
  ]);

  // Resolve record identifiers back to their references, so the queue shows
  // "ORD-4471" rather than a uuid a human cannot act on.
  const rows = (exceptionRows ?? []) as ExceptionRow[];
  const referencedIds = [
    ...new Set(rows.flatMap((row) => [...row.source_record_ids, ...row.ledger_entry_ids])),
  ];

  const referenceById = new Map<string, string>();
  if (referencedIds.length > 0) {
    const [{ data: sources }, { data: ledgers }] = await Promise.all([
      client.from('source_records').select('id, external_ref').in('id', referencedIds),
      client.from('ledger_entries').select('id, external_ref').in('id', referencedIds),
    ]);
    for (const row of [...(sources ?? []), ...(ledgers ?? [])]) {
      const typed = row as { id: string; external_ref: string };
      referenceById.set(typed.id, typed.external_ref);
    }
  }

  const tierCounts = MATCH_TIERS.map((tier) => ({
    tier,
    count: (matches ?? []).filter((match) => (match as { tier: string }).tier === tier).length,
  }));

  const typeCounts = [...rows.reduce((counts, row) => {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  // Money is formatted here, on the server: `Minor` is a bigint and cannot
  // cross into a Client Component, and converting it to `number` would
  // reintroduce floats into the money path.
  const exceptions: ExceptionView[] = rows.map((row) => {
    const evidence = (decodeFromJsonb(row.evidence) ?? []) as EvidenceLine[];
    const reference =
      referenceById.get(row.source_record_ids[0] ?? '') ??
      referenceById.get(row.ledger_entry_ids[0] ?? '') ??
      '—';

    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      reference,
      // The first sentence of the reason doubles as the collapsed summary,
      // so a reader can triage the queue without expanding every row.
      summary: `${row.stated_reason.split('. ')[0] ?? row.stated_reason}`,
      statedReason: row.stated_reason,
      ...(row.suggested_action === null ? {} : { suggestedAction: row.suggested_action }),
      evidence: evidence.map((line) => ({
        label: line.label,
        ...(line.sourceMinor === undefined
          ? {}
          : { source: formatMinor(toMinor(line.sourceMinor), { accounting: true }) }),
        ...(line.ledgerMinor === undefined
          ? {}
          : { ledger: formatMinor(toMinor(line.ledgerMinor), { accounting: true }) }),
        ...(line.note === undefined ? {} : { note: line.note }),
      })),
    };
  });

  const params_ = summary.params;
  const datasetName = (dataset as { name?: string } | null)?.name ?? 'Dataset';

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <nav className="text-xs text-ink-muted">
        <Link href="/datasets" className="hover:text-ink">
          Datasets
        </Link>
        <span className="mx-1.5" aria-hidden="true">/</span>
        <Link href={`/datasets/${id}`} className="hover:text-ink">
          {datasetName}
        </Link>
        <span className="mx-1.5" aria-hidden="true">/</span>
        <span className="font-mono">{summary.created_at.slice(0, 16).replace('T', ' ')}</span>
      </nav>

      {/* The closing figure, under a double rule — the accounting convention
          for a final total rather than a subtotal. */}
      <section className="mt-8 max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Match rate
        </p>
        <p className="rule-closing pb-2 font-mono text-6xl font-medium tracking-tight">
          {(summary.match_rate * 100).toFixed(1)}
          <span className="text-3xl text-ink-muted">%</span>
        </p>
        <div className="mt-5">
          <ReconciliationBar matched={summary.matched_count} total={summary.source_count} />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Reconciled in {summary.duration_ms} ms, with no model involved.
        </p>
      </section>

      <div className="mt-12 grid gap-10 md:grid-cols-3">
        <section>
          <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Matched by
          </h2>
          <dl className="mt-1">
            {tierCounts.map(({ tier, count }) => (
              <div key={tier} className="flex justify-between border-b border-rule py-1.5 text-sm">
                <dt className="text-ink-muted">{TIER_LABELS[tier]}</dt>
                <dd className="font-mono">{count}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Exceptions by type
          </h2>
          <dl className="mt-1">
            {typeCounts.length === 0 && (
              <p className="py-1.5 text-sm text-ink-muted">None.</p>
            )}
            {typeCounts.map(([type, count]) => (
              <div key={type} className="flex justify-between border-b border-rule py-1.5 text-sm">
                <dt className="font-mono text-xs text-ink-muted">{type}</dt>
                <dd className="font-mono">{count}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Always visible, never behind a settings panel: a threshold a user
            cannot see is a magic number they cannot trust. */}
        <section>
          <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Thresholds applied
          </h2>
          <dl className="mt-1 text-sm">
            <Threshold label="Date window" value={`±${String(params_.dateWindowDays ?? '—')} days`} />
            <Threshold
              label="Amount tolerance"
              value={`±${(Number(params_.amountToleranceBps ?? 0) / 100).toFixed(2)}%`}
            />
            <Threshold
              label="Reference match"
              value={`≥ ${String(params_.refSimilarityThreshold ?? '—')}`}
            />
            <Threshold
              label="Combined payments"
              value={`≤ ${String(params_.maxPartialSetSize ?? '—')} records`}
            />
          </dl>
        </section>
      </div>

      <ExceptionList exceptions={exceptions} />

      <AskPanel runId={runId} />
    </main>
  );
}

/** One threshold row. */
function Threshold({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between border-b border-rule py-1.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}
