/** Shown while the dataset list resolves. */
import { AppHeader } from '@/components/app-header';
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <AppHeader />
      <PageShell>
        <LoadingAnnouncement label="Loading your datasets" />
        <HeaderSkeleton />
        {/* Sized like the create-dataset card, so the list below it does not
            jump once the real form renders. */}
        <div
          aria-hidden="true"
          className="mt-7 h-24 animate-pulse rounded-card border border-rule bg-paper-raised"
        />
        <TableSkeleton columns={['w-48', 'w-24', 'w-16', 'w-24']} />
      </PageShell>
    </>
  );
}
