/**
 * Every open exception, across every dataset (docs/DESIGN.md §S-9).
 *
 * The queue on a run answers "what did this reconciliation find". This answers
 * "what is waiting for me", which is the question a reviewer opening the tool
 * in the morning actually has, and which previously required opening each
 * dataset in turn.
 *
 * Read-only: statuses are changed on the run screen, where the evidence sits
 * beside the finding. Offering the control here without the evidence would
 * invite resolving something on the strength of its title alone.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-sidebar';
import { SeverityBadge } from '@/components/severity';
import { SummaryCards } from '@/components/summary-cards';
import { Card, EmptyState, PageShell, SectionHeading, TableScroller } from '@/components/ui';
import { SEVERITY_RANK, type Severity } from '@/core/taxonomy';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** Reviewer workflow state, mirroring the Postgres enum. */
type Status = 'flagged' | 'reviewing' | 'resolved';

/** One exception, joined to the run and dataset it belongs to. */
interface Row {
  readonly id: string;
  readonly type: string;
  readonly severity: Severity;
  readonly status: Status;
  readonly stated_reason: string;
  readonly recon_run_id: string;
  readonly recon_runs: { readonly dataset_id: string; readonly created_at: string } | null;
}

const STATUS_META: Readonly<Record<Status, { label: string; className: string }>> = {
  flagged: { label: 'Flagged', className: 'bg-unaccounted-wash text-unaccounted' },
  reviewing: { label: 'Reviewing', className: 'bg-undecided-wash text-undecided' },
  resolved: { label: 'Resolved', className: 'bg-settled-wash text-settled' },
};

export default async function ExceptionsPage() {
  const user = await getCurrentUser();
  if (user === null) redirect('/signin?next=%2Fexceptions');

  const client = await createClient();
  const { data } = await client
    .from('exceptions')
    .select('id, type, severity, status, stated_reason, recon_run_id, recon_runs(dataset_id, created_at)')
    .limit(300);

  // Sorted here rather than in SQL: severity is an enum whose *rank* is defined
  // in the taxonomy, and Postgres would order it alphabetically. Ordering by a
  // shared constant keeps this list and the engine's own ordering in agreement.
  const rows = ((data ?? []) as unknown as Row[])
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const open = rows.filter((row) => row.status !== 'resolved');
  const high = open.filter((row) => row.severity === 'high').length;

  return (
    <AppShell email={user.email}>
      <PageShell width="wide">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Exceptions</h1>
        <p className="prose-measure mt-2 text-sm leading-relaxed text-ink-muted">
          Everything the engine could not resolve, across every dataset. Open a finding to see both
          sides of the comparison and to change its status.
        </p>

        <div className="mt-6">
          <SummaryCards
            figures={[
              {
                label: 'Open',
                value: String(open.length),
                detail: 'Flagged or under review',
                ...(open.length > 0 ? ({ tone: 'unaccounted' } as const) : {}),
              },
              {
                label: 'High severity',
                value: String(high),
                detail: 'Money unaccounted for',
              },
              {
                label: 'Resolved',
                value: String(rows.length - open.length),
                detail: 'Closed by a reviewer',
                tone: 'settled',
              },
              { label: 'Total found', value: String(rows.length), detail: 'Across all runs' },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <section className="mt-8">
            <EmptyState title="Nothing to review.">
              No reconciliation has produced an exception yet. Run one from a dataset and anything
              it cannot resolve will appear here.
            </EmptyState>
          </section>
        ) : (
          <section className="mt-10">
            <SectionHeading
              trailing={<span className="font-mono text-xs text-ink-muted">{rows.length}</span>}
            >
              All findings
            </SectionHeading>
            <Card className="mt-3 overflow-hidden">
              <TableScroller label="All exceptions across runs">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-rule bg-paper-sunk/60 text-[11px] uppercase tracking-wider text-ink-muted">
                      <th scope="col" className="px-4 py-2 text-left font-medium">Severity</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Type</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Reason</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Status</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const meta = STATUS_META[row.status];
                      const datasetId = row.recon_runs?.dataset_id;
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-rule transition-colors duration-150 ease-ui last:border-0 hover:bg-paper-sunk/50"
                        >
                          <td className="px-4 py-2">
                            <SeverityBadge severity={row.severity} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-ink-muted">
                            {row.type}
                          </td>
                          <td className="px-4 py-2">
                            <span className="block max-w-[28rem] truncate">
                              {row.stated_reason}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`whitespace-nowrap rounded-control px-2 py-1 text-[11px] font-medium ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2">
                            {datasetId === undefined ? (
                              <span className="text-xs text-ink-muted">—</span>
                            ) : (
                              /* Deep-links straight to the finding, expanded. */
                              <Link
                                href={`/datasets/${datasetId}/runs/${row.recon_run_id}?exception=${row.id}`}
                                className="text-xs underline underline-offset-2"
                              >
                                Open
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroller>
            </Card>
          </section>
        )}
      </PageShell>
    </AppShell>
  );
}
