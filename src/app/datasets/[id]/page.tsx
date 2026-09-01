/**
 * Dataset detail — upload both sides and reconcile (docs/DESIGN.md §S-3).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppHeader, Breadcrumb, PageHeading } from '@/components/app-header';
import { DatasetWorkbench } from '@/components/dataset-workbench';
import { Card, PageShell, SectionHeading } from '@/components/ui';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

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
  const [client, user] = await Promise.all([createClient(), getCurrentUser()]);

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
    <>
      <AppHeader email={user?.email} />
      <PageShell width="wide">
        <Breadcrumb
          items={[{ label: 'Datasets', href: '/datasets' }, { label: record.name }]}
        />

        <div className="mt-3">
          <PageHeading
            title={record.name}
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="rounded-control border border-rule bg-paper-sunk px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                  {record.domain}
                </span>
                <span className="rounded-control border border-rule bg-paper-sunk px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                  {record.currency}
                </span>
              </span>
            }
          />
        </div>

        <div className="mt-8">
          <DatasetWorkbench
            datasetId={record.id}
            domain={record.domain === 'bank' ? 'bank' : 'settlement'}
            sourceCount={sourceCount ?? 0}
            ledgerCount={ledgerCount ?? 0}
          />
        </div>

        {history.length > 0 && (
          <section className="mt-12">
            <SectionHeading>Previous runs</SectionHeading>
            <Card className="mt-3 overflow-hidden">
              <ul>
                {history.map((run) => (
                  <li key={run.id} className="border-b border-rule last:border-0">
                    <Link
                      href={`/datasets/${record.id}/runs/${run.id}`}
                      className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3 text-sm transition-colors duration-150 ease-ui hover:bg-paper-sunk/60"
                    >
                      <span className="font-mono text-xs text-ink-muted">
                        {run.created_at.slice(0, 16).replace('T', ' ')}
                      </span>
                      <span className="font-mono font-medium">
                        {(run.match_rate * 100).toFixed(1)}%
                      </span>
                      <span className="text-ink-muted">
                        {run.exception_count} exception{run.exception_count === 1 ? '' : 's'}
                      </span>
                      <span
                        aria-hidden="true"
                        className="ml-auto text-ink-faint transition-transform duration-150 ease-ui"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </PageShell>
    </>
  );
}
