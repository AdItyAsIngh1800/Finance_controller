/** Shown while a dataset and its run history resolve. */
import { AppHeader } from '@/components/app-header';
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <AppHeader />
      <PageShell width="wide">
        <LoadingAnnouncement label="Loading this dataset" />
        <HeaderSkeleton />
        <div aria-hidden="true" className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="h-52 animate-pulse rounded-card border border-rule bg-paper-raised" />
          <div className="h-52 animate-pulse rounded-card border border-rule bg-paper-raised" />
        </div>
        <TableSkeleton rows={3} columns={['w-32', 'w-16', 'w-28']} />
      </PageShell>
    </>
  );
}
