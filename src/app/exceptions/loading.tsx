/** Shown while the cross-dataset exception queue resolves. */
import { AppShell } from '@/components/app-sidebar';
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <AppShell>
      <PageShell width="wide">
        <LoadingAnnouncement label="Loading your exceptions" />
        <HeaderSkeleton />
        {/* Four summary cards, then the findings table. Sized to match so the
            page does not reflow underneath a reader who has started scanning. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((slot) => (
            <div
              key={slot}
              aria-hidden="true"
              className="h-24 animate-pulse rounded-card border border-rule bg-paper-raised"
            />
          ))}
        </div>
        <TableSkeleton columns={['w-16', 'w-36', 'w-56', 'w-20', 'w-12']} />
      </PageShell>
    </AppShell>
  );
}
