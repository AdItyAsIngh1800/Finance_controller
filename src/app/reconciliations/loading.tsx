/**
 * Shown while the run list resolves.
 *
 * `/reconciliations`, `/exceptions` and `/settings` shipped without loading
 * states on 3 September, so all three rendered nothing until their server
 * component finished — the app appeared to hang for the length of a query
 * immediately after a reviewer clicked. The other four routes already had
 * skeletons; this is the same pattern.
 */
import { AppShell } from '@/components/app-sidebar';
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <AppShell>
      <PageShell width="wide">
        <LoadingAnnouncement label="Loading your reconciliation runs" />
        <HeaderSkeleton />
        {/* Column widths mirror the real table, so nothing shifts when it
            arrives: run, dataset, records, match rate, exceptions, duration. */}
        <TableSkeleton columns={['w-32', 'w-40', 'w-16', 'w-20', 'w-16', 'w-16']} />
      </PageShell>
    </AppShell>
  );
}
