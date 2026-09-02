/**
 * Every reconciliation run, across every dataset (docs/DESIGN.md §S-9).
 *
 * Until now a run could only be reached by opening its dataset first, which
 * meant "what did I last run, and how did it go" required remembering which
 * dataset it was in. Runs are the unit of work this tool produces, so they get
 * a list of their own.
 *
 * Read-only and append-only, like the runs themselves.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-sidebar';
import { Card, EmptyState, PageShell, SectionHeading } from '@/components/ui';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** One run, joined to the dataset it belongs to. */
interface RunRow {
  readonly id: string;
  readonly dataset_id: string;
  readonly source_count: number;
  readonly matched_count: number;
  readonly exception_count: number;
  readonly match_rate: number;
  readonly duration_ms: number;
  readonly created_at: string;
  readonly datasets: { readonly name: string; readonly domain: string } | null;
}

export default async function ReconciliationsPage() {
  const user = await getCurrentUser();
  if (user === null) redirect('/signin?next=%2Freconciliations');

  const client = await createClient();
  // The embedded dataset read is one round trip rather than a second query per
  // run; RLS scopes both sides to the signed-in user.
  const { data } = await client
    .from('recon_runs')
    .select(
      'id, dataset_id, source_count, matched_count, exception_count, match_rate, duration_ms, created_at, datasets(name, domain)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const runs = (data ?? []) as unknown as RunRow[];

  return (
    <AppShell email={user.email}>
      <PageShell width="wide">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Reconciliations</h1>
        <p className="prose-measure mt-2 text-sm leading-relaxed text-ink-muted">
          Every run, newest first. Runs are append-only and snapshot the thresholds they used, so an
          old result stays explicable after the defaults are retuned.
        </p>

        {runs.length === 0 ? (
          <section className="mt-8">
            <EmptyState title="No reconciliations yet.">
              Upload a processor or bank file alongside your ledger on a dataset, then run it. The
              results will collect here.
            </EmptyState>
          </section>
        ) : (
          <section className="mt-8">
            <SectionHeading
              trailing={<span className="font-mono text-xs text-ink-muted">{runs.length}</span>}
            >
              All runs
            </SectionHeading>
            <Card className="mt-3 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead>
                    <tr className="border-b border-rule bg-paper-sunk/60 text-[11px] uppercase tracking-wider text-ink-muted">
                      <th scope="col" className="px-4 py-2 text-left font-medium">Run</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Dataset</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Records</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Match rate</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Exceptions</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Took</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr
                        key={run.id}
                        className="border-b border-rule transition-colors duration-150 ease-ui last:border-0 hover:bg-paper-sunk/50"
                      >
                        <td className="whitespace-nowrap px-4 py-2">
                          <Link
                            href={`/datasets/${run.dataset_id}/runs/${run.id}`}
                            className="font-mono text-xs underline underline-offset-2"
                          >
                            {run.created_at.slice(0, 16).replace('T', ' ')}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <span className="block max-w-[16rem] truncate">
                            {run.datasets?.name ?? 'Dataset'}
                          </span>
                          <span className="text-xs text-ink-muted">{run.datasets?.domain}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                          {run.source_count.toLocaleString('en-IN')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                          {(run.match_rate * 100).toFixed(1)}%
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                          {run.exception_count}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-ink-muted">
                          {run.duration_ms} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}
      </PageShell>
    </AppShell>
  );
}
