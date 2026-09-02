/** Shown while a reconciliation run resolves. */
import { AppShell } from '@/components/app-sidebar';
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <AppShell>
      <PageShell width="wide">
        <LoadingAnnouncement label="Loading reconciliation results" />
        <HeaderSkeleton />
        {/* Sized like the summary card, so the headline figure does not jump. */}
        <div
          aria-hidden="true"
          className="mt-4 h-64 animate-pulse rounded-card border border-rule bg-paper-raised lg:h-56"
        />
        <TableSkeleton rows={8} columns={['w-16', 'w-44', 'w-24', 'w-64']} />
      </PageShell>
    </AppShell>
  );
}
