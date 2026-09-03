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

import { notFound, redirect } from 'next/navigation';
import { Breadcrumb } from '@/components/app-header';
import { AppShell } from '@/components/app-sidebar';
import type { ExceptionStatus, ExceptionView } from '@/components/exception-list';
import { PrintButton } from '@/components/print-button';
import { RunCharts, type ConfidenceDatum } from '@/components/run-charts';
import { RunReport } from '@/components/run-report';
import { RunWorkspace } from '@/components/run-workspace';
import { SummaryCards } from '@/components/summary-cards';
import { ReconciliationBar } from '@/components/reconciliation-bar';
import { formatMinor, sumMinor, toMinor } from '@/core/money';
import { EXCEPTION_SEVERITY, MATCH_TIERS, SEVERITY_RANK, type ExceptionType, type MatchTier, type Severity } from '@/core/taxonomy';
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
  readonly status: ExceptionStatus;
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
  searchParams,
}: {
  readonly params: Promise<{ id: string; runId: string }>;
  /**
   * `?exception=<id>` opens that finding on arrival.
   *
   * Resolved here rather than in the client component so the row is expanded in
   * the first paint. Reading it on the client instead would mean either a
   * hydration mismatch (the server rendered it closed) or a visible jump as the
   * row opens after hydration, and this parameter exists precisely so a link
   * lands someone *on* the finding.
   */
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  const { id, runId } = await params;
  const expandedParam = (await searchParams).exception;
  const initialExpanded = typeof expandedParam === 'string' ? expandedParam : null;
  const [client, user] = await Promise.all([createClient(), getCurrentUser()]);
  // Defence in depth. The proxy already keeps signed-out visitors off this
  // route, but Next's own documentation is explicit that proxy is an optimistic
  // check rather than an authorization boundary — and the proxy silently did
  // not run in development until 3 September 2026, which is exactly the class
  // of failure this guard exists for. RLS is the layer beneath both.
  if (user === null) redirect('/signin?next=%2Fdatasets');


  const { data: run } = await client
    .from('recon_runs')
    .select('id, dataset_id, params, source_count, ledger_count, matched_count, exception_count, match_rate, duration_ms, created_at')
    .eq('id', runId)
    .maybeSingle();

  if (run === null) notFound();
  const summary = run as {
    source_count: number;
    ledger_count: number;
    matched_count: number;
    exception_count: number;
    match_rate: number;
    duration_ms: number;
    created_at: string;
    params: Record<string, unknown>;
  };

  const [{ data: dataset }, { data: matches }, { data: exceptionRows }, { data: runHistory }] =
    await Promise.all([
    client.from('datasets').select('name, domain').eq('id', id).maybeSingle(),
    // `source_record_ids` comes back too: the reconciled *value* is the sum of
    // the amounts behind the matches, and there is no stored total to read.
    client.from('matches').select('tier, source_record_ids').eq('recon_run_id', runId),
    client
      .from('exceptions')
      .select('id, type, severity, status, source_record_ids, ledger_entry_ids, stated_reason, evidence, suggested_action')
      .eq('recon_run_id', runId),
    // Every run of this dataset, oldest first — the trend chart's x-axis is
    // these runs in order, not a calendar.
    client
      .from('recon_runs')
      .select('id, match_rate, created_at')
      .eq('dataset_id', id)
      .order('created_at', { ascending: true }),
  ]);

  // Resolve record identifiers back to their references, so the queue shows
  // "ORD-4471" rather than a uuid a human cannot act on.
  const rows = (exceptionRows ?? []) as ExceptionRow[];
  const referencedIds = [
    ...new Set(rows.flatMap((row) => [...row.source_record_ids, ...row.ledger_entry_ids])),
  ];

  /** One resolved record, as the queue's Date and Amount columns need it. */
  interface ResolvedRecord {
    readonly ref: string;
    readonly date: string;
    readonly amountMinor: bigint;
    readonly minConfidence: number | null;
  }

  const recordById = new Map<string, ResolvedRecord>();
  if (referencedIds.length > 0) {
    // `extractions(min_confidence)` is an embedded read across the FK, so the
    // confidence column costs no extra round trip. It is null for CSV-loaded
    // records, which is the honest value: nothing was inferred.
    const columns = 'id, external_ref, txn_date, amount_minor, extractions(min_confidence)';
    const [{ data: sources }, { data: ledgers }] = await Promise.all([
      client.from('source_records').select(columns).in('id', referencedIds),
      client.from('ledger_entries').select(columns).in('id', referencedIds),
    ]);
    for (const row of [...(sources ?? []), ...(ledgers ?? [])]) {
      const typed = row as unknown as {
        id: string;
        external_ref: string;
        txn_date: string;
        amount_minor: number | string;
        extractions: { min_confidence: number | null } | null;
      };
      recordById.set(typed.id, {
        ref: typed.external_ref,
        date: typed.txn_date,
        amountMinor: BigInt(typed.amount_minor),
        minConfidence: typed.extractions?.min_confidence ?? null,
      });
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
  /*
   * Severity first, then largest amount — the order §S-6 specifies.
   *
   * This was never actually applied. The query has no ORDER BY, and the queue
   * looked correctly sorted only because the engine happened to insert in that
   * order and Postgres happened to return it. Changing a row's status broke the
   * illusion: an updated row is rewritten and comes back in a different place,
   * so a reviewer marking a finding watched it jump down the table.
   *
   * Sorted here rather than in SQL because severity's *rank* is defined in the
   * taxonomy — Postgres would order the enum alphabetically, putting `high`
   * after `flagged`-style values by accident of spelling rather than by
   * meaning. Amount descends so the costliest unexplained gap is first.
   */
  const sortedRows = [...rows].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const amountA = recordById.get(a.source_record_ids[0] ?? '')?.amountMinor ?? 0n;
    const amountB = recordById.get(b.source_record_ids[0] ?? '')?.amountMinor ?? 0n;
    // bigint comparison, then narrowed to a number: subtracting bigints and
    // coercing would overflow for large amounts and lose the sign for small.
    if (amountA === amountB) return 0;
    return amountB > amountA ? 1 : -1;
  });

  const exceptions: ExceptionView[] = sortedRows.map((row) => {
    const evidence = (decodeFromJsonb(row.evidence) ?? []) as EvidenceLine[];
    const record =
      recordById.get(row.source_record_ids[0] ?? '') ??
      recordById.get(row.ledger_entry_ids[0] ?? '');

    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      reference: record?.ref ?? '—',
      date: record?.date ?? '—',
      amount: record === undefined ? '—' : formatMinor(toMinor(record.amountMinor)),
      // Only present when the record came from an extraction. A CSV row has no
      // confidence, and printing 1.00 would assert a certainty the pipeline
      // never produced.
      ...(record?.minConfidence == null
        ? {}
        : { confidence: record.minConfidence.toFixed(2) }),
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

  /*
   * Value reconciled: the sum of the amounts behind every match.
   *
   * Summed over the *source* records named by the matches, deduplicated,
   * because a PARTIAL_SET match names several of them and adding the match's
   * records twice would overstate the figure. `sumMinor` keeps this in bigint
   * from end to end — this is the one place on the page that adds money, and
   * doing it in `number` is exactly the float drift the money type exists to
   * prevent.
   */
  const matchedSourceIds = [
    ...new Set(
      (matches ?? []).flatMap(
        (match) => (match as { source_record_ids: string[] }).source_record_ids,
      ),
    ),
  ];

  /*
   * Fetched separately rather than read out of `recordById`.
   *
   * That map is built from the ids the *exceptions* reference, so looking the
   * matched records up in it silently returned only the handful that happen to
   * appear in both — the total came out at roughly a thirtieth of the real
   * figure, which is small enough to look plausible and is therefore the worst
   * kind of wrong. Found on 4 September by reading the number on a seeded run
   * and comparing it against the per-record amounts in the queue beneath it.
   *
   * Only two columns, and no `extractions` join: this query exists to add up
   * money, not to render anything.
   */
  const { data: matchedAmounts } =
    matchedSourceIds.length === 0
      ? { data: [] }
      : await client.from('source_records').select('amount_minor').in('id', matchedSourceIds);

  const reconciledMinor = sumMinor(
    (matchedAmounts ?? []).map((row) =>
      toMinor(BigInt((row as { amount_minor: number | string }).amount_minor)),
    ),
  );

  /** Exceptions still awaiting a reviewer — the actionable count. */
  const openCount = rows.filter((row) => row.status !== 'resolved').length;

  /** Bars for the breakdown chart, largest first, coloured by severity. */
  const chartByType = typeCounts.map(([type, count]) => ({
    type,
    count,
    severity: EXCEPTION_SEVERITY[type as ExceptionType] ?? 'low',
  }));

  /** One point per run of this dataset, in the order they happened. */
  const chartTrend = ((runHistory ?? []) as { id: string; match_rate: number; created_at: string }[])
    .map((entry, index) => ({
      label: `Run ${index + 1}`,
      matchRate: Number((entry.match_rate * 100).toFixed(1)),
    }));

  /*
   * Confidence histogram.
   *
   * Bucketed over the records this run actually referenced rather than over
   * every extraction in the dataset, so the chart describes the same population
   * as the rest of the page. Empty when nothing was extracted, which the chart
   * renders as an explanation rather than as an empty axis.
   */
  const BUCKETS = ['0.5–0.6', '0.6–0.7', '0.7–0.8', '0.8–0.9', '0.9–1.0'] as const;
  const confidences = [...recordById.values()]
    .map((record) => record.minConfidence)
    .filter((value): value is number => value !== null);
  const chartConfidence: ConfidenceDatum[] =
    confidences.length === 0
      ? []
      : BUCKETS.map((bucket, index) => {
          const low = 0.5 + index * 0.1;
          const high = low + 0.1;
          return {
            bucket,
            count: confidences.filter(
              (value) => value >= low && (index === BUCKETS.length - 1 ? value <= high : value < high),
            ).length,
            // 0.85 sits inside the 0.8–0.9 bucket, so that bucket straddles the
            // gate. Marked as below it: a bucket containing *any* held-back
            // record should not read as fully passed.
            belowThreshold: low < 0.85,
          };
        });

  const params_ = summary.params;
  const datasetName = (dataset as { name?: string } | null)?.name ?? 'Dataset';
  const datasetDomain = (dataset as { domain?: string } | null)?.domain ?? 'settlement';

  /*
   * The run's thresholds, formatted once.
   *
   * Read from `recon_runs.params` rather than from the current defaults: the
   * point of snapshotting them is that an old report stays explicable after a
   * default is retuned, and formatting them twice would let the screen and the
   * printed page drift apart.
   */
  const thresholdRows = [
    { label: 'Date window', value: `±${String(params_.dateWindowDays ?? '—')} days` },
    {
      label: 'Amount tolerance',
      value: `±${(Number(params_.amountToleranceBps ?? 0) / 100).toFixed(2)}%`,
    },
    { label: 'Reference match', value: `≥ ${String(params_.refSimilarityThreshold ?? '—')}` },
    {
      label: 'Combined payments',
      value: `≤ ${String(params_.maxPartialSetSize ?? '—')} records`,
    },
  ];

  return (
    <AppShell email={user?.email}>
      <PageShell width="wide">
        <Breadcrumb
          items={[
            { label: 'Datasets', href: '/datasets' },
            { label: datasetName, href: `/datasets/${id}` },
            { label: summary.created_at.slice(0, 16).replace('T', ' ') },
          ]}
        />

        <div className="mt-3 flex justify-end">
          <PrintButton />
        </div>

        {/*
          The four figures a controller looks for first. The match rate appears
          here *and* as the headline below: this row is for scanning, the block
          below is for interrogating, and the same number serving both is
          cheaper than teaching a reader that they differ.
        */}
        <div className="mt-4">
          <SummaryCards
            figures={[
              {
                label: 'Transactions processed',
                value: summary.source_count.toLocaleString('en-IN'),
                detail: `${summary.ledger_count.toLocaleString('en-IN')} ledger entries compared`,
              },
              {
                label: 'Match rate',
                value: `${(summary.match_rate * 100).toFixed(1)}%`,
                detail: `${summary.matched_count.toLocaleString('en-IN')} of ${summary.source_count.toLocaleString('en-IN')} source records`,
                tone: 'settled',
              },
              {
                label: 'Exceptions to review',
                value: openCount.toLocaleString('en-IN'),
                detail:
                  openCount === summary.exception_count
                    ? 'None resolved yet'
                    : `${summary.exception_count - openCount} resolved`,
                ...(openCount > 0 ? ({ tone: 'unaccounted' } as const) : {}),
              },
              {
                label: 'Value reconciled',
                value: formatMinor(reconciledMinor),
                detail: 'Sum of the matched source records',
              },
            ]}
          />
        </div>

        {/* The closing figure, under a double rule — the accounting convention
            for a final total rather than a subtotal. */}
        <Card className="mt-6 grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-10">
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
              {/* Same array the printed report reads, so a threshold cannot
                  show one value on screen and another on paper. */}
              <dl className="mt-1">
                {thresholdRows.map((threshold) => (
                  <Row key={threshold.label} label={threshold.label} value={threshold.value} />
                ))}
              </dl>
            </section>
          </div>
        </Card>

        <RunCharts byType={chartByType} trend={chartTrend} confidence={chartConfidence} />

        <RunWorkspace
          runId={runId}
          exceptions={exceptions}
          initialExpanded={initialExpanded}
        />

        {/* Hidden on screen, and the only thing that prints. */}
        <RunReport
          datasetName={datasetName}
          domain={datasetDomain}
          runAt={summary.created_at.slice(0, 16).replace('T', ' ')}
          sourceCount={summary.source_count}
          ledgerCount={summary.ledger_count}
          matchedCount={summary.matched_count}
          matchRate={summary.match_rate}
          reconciledValue={formatMinor(reconciledMinor)}
          exceptions={exceptions}
          tiers={tierCounts.map(({ tier, count }) => ({ label: TIER_LABELS[tier], count }))}
          thresholds={thresholdRows}
        />
      </PageShell>
    </AppShell>
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
