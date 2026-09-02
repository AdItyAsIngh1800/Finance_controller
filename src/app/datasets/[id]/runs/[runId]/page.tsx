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

import { notFound } from 'next/navigation';
import { AppHeader, Breadcrumb } from '@/components/app-header';
import { AskPanel } from '@/components/ask-panel';
import { ExceptionList, type ExceptionView } from '@/components/exception-list';
import { ReconciliationBar } from '@/components/reconciliation-bar';
import { formatMinor, toMinor } from '@/core/money';
import { MATCH_TIERS, type MatchTier, type Severity } from '@/core/taxonomy';
import { Card, PageShell, SectionHeading } from '@/components/ui';
import { decodeFromJsonb } from '@/lib/serialize';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

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
  const [client, user] = await Promise.all([createClient(), getCurrentUser()]);

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
    <>
      <AppHeader email={user?.email} />
      <PageShell width="wide">
        <Breadcrumb
          items={[
            { label: 'Datasets', href: '/datasets' },
            { label: datasetName, href: `/datasets/${id}` },
            { label: summary.created_at.slice(0, 16).replace('T', ' ') },
          ]}
        />

        {/* The closing figure, under a double rule — the accounting convention
            for a final total rather than a subtotal. */}
        <Card className="mt-4 grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-10">
          <div>
            <p className="eyebrow">Match rate</p>
            <p className="rule-closing pb-2 font-mono text-5xl font-medium tracking-tight sm:text-6xl">
              {(summary.match_rate * 100).toFixed(1)}
              <span className="text-2xl text-ink-muted sm:text-3xl">%</span>
            </p>
            <div className="mt-5">
              <ReconciliationBar matched={summary.matched_count} total={summary.source_count} />
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Reconciled in {summary.duration_ms} ms, with no model involved.
            </p>
          </div>

          {/* The three read-outs that qualify the headline. Side by side with it
              from `lg`, stacked beneath it below that — a controller should not
              have to scroll away from the rate to see what produced it. */}
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            <section>
              <SectionHeading>Matched by</SectionHeading>
              <dl className="mt-1">
                {tierCounts.map(({ tier, count }) => (
                  <Row key={tier} label={TIER_LABELS[tier]} value={count} />
                ))}
                {/*
                  No total row here, deliberately. These are counts of *matches*,
                  while `matched_count` behind the headline counts matched source
                  *records* — a PARTIAL_SET pairing contributes one match and
                  several records, so the two disagree exactly when combined
                  payments occur. Printing either figure under this column would
                  read as its sum and be wrong in the one case the tier exists
                  for. @see src/core/reconcile/engine.ts — matchedSourceIds
                */}
              </dl>
            </section>

            <section>
              <SectionHeading>Exceptions by type</SectionHeading>
              <dl className="mt-1">
                {typeCounts.length === 0 && (
                  <p className="py-1.5 text-sm text-ink-muted">None.</p>
                )}
                {typeCounts.map(([type, count]) => (
                  <Row key={type} label={type} value={count} mono />
                ))}
              </dl>
            </section>

            {/* Always visible, never behind a settings panel: a threshold a user
                cannot see is a magic number they cannot trust. */}
            <section className="sm:col-span-2 lg:col-span-1">
              <SectionHeading>Thresholds applied</SectionHeading>
              <dl className="mt-1">
                <Row label="Date window" value={`±${String(params_.dateWindowDays ?? '—')} days`} />
                <Row
                  label="Amount tolerance"
                  value={`±${(Number(params_.amountToleranceBps ?? 0) / 100).toFixed(2)}%`}
                />
                <Row
                  label="Reference match"
                  value={`≥ ${String(params_.refSimilarityThreshold ?? '—')}`}
                />
                <Row
                  label="Combined payments"
                  value={`≤ ${String(params_.maxPartialSetSize ?? '—')} records`}
                />
              </dl>
            </section>
          </div>
        </Card>

        <ExceptionList exceptions={exceptions} />

        <AskPanel runId={runId} />
      </PageShell>
    </>
  );
}

/**
 * One label-and-figure row.
 *
 * The three summary lists — tiers, exception types, thresholds — were three
 * near-identical row markups before this; they are one shape, so they are one
 * component.
 *
 * @param props.mono - Whether the label itself is a code rather than prose,
 *   which the taxonomy names are.
 */
function Row({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule py-1.5 text-sm last:border-0">
      <dt className={`min-w-0 truncate text-ink-muted ${mono ? 'font-mono text-xs' : ''}`}>
        {label}
      </dt>
      <dd className="shrink-0 font-mono text-sm">{value}</dd>
    </div>
  );
}
