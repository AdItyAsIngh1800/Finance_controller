/**
 * Dataset detail — upload both sides and reconcile (docs/DESIGN.md §S-3).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DatasetWorkbench } from '@/components/dataset-workbench';
import { createClient } from '@/lib/supabase/server';

/** A previous run, as listed. */
interface RunRow {
  readonly id: string;
  readonly created_at: string;
  readonly match_rate: number;
  readonly exception_count: number;
}

export default async function DatasetPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await createClient();

  // RLS scopes this to the signed-in user, so a dataset belonging to someone
  // else is indistinguishable from one that does not exist — which is exactly
  // what it should be.
  const { data: dataset } = await client
    .from('datasets')
    .select('id, name, domain, currency')
    .eq('id', id)
    .maybeSingle();

  if (dataset === null) notFound();
  const record = dataset as { id: string; name: string; domain: string; currency: string };

  const [{ count: sourceCount }, { count: ledgerCount }, { data: runs }] = await Promise.all([
    client.from('source_records').select('id', { count: 'exact', head: true }).eq('dataset_id', id),
    client.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('dataset_id', id),
    client
      .from('recon_runs')
      .select('id, created_at, match_rate, exception_count')
      .eq('dataset_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const history = (runs ?? []) as RunRow[];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <nav className="text-xs text-ink-muted">
        <Link href="/datasets" className="hover:text-ink">
          Datasets
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        <span>{record.name}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{record.name}</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-muted">
        {record.domain} · {record.currency}
      </p>

      <div className="mt-8">
        <DatasetWorkbench
          datasetId={record.id}
          domain={record.domain === 'bank' ? 'bank' : 'settlement'}
          sourceCount={sourceCount ?? 0}
          ledgerCount={ledgerCount ?? 0}
        />
      </div>

      {history.length > 0 && (
        <section className="mt-14">
          <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Previous runs
          </h2>
          <ul>
            {history.map((run) => (
              <li key={run.id} className="border-b border-rule">
                <Link
                  href={`/datasets/${record.id}/runs/${run.id}`}
                  className="flex items-baseline gap-6 px-1 py-2.5 text-sm hover:bg-paper-sunk"
                >
                  <span className="font-mono text-ink-muted">
                    {run.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                  <span className="font-mono">{(run.match_rate * 100).toFixed(1)}%</span>
                  <span className="text-ink-muted">
                    {run.exception_count} exception{run.exception_count === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
