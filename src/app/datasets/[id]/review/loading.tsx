/** Shown while the review queue resolves. */
import { AppHeader } from '@/components/app-header';
import { HeaderSkeleton, LoadingAnnouncement } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <AppHeader />
      <PageShell width="wide">
        <LoadingAnnouncement label="Loading documents awaiting review" />
        <HeaderSkeleton />
        {/* Shaped like the split document/fields panel it stands in for. */}
        <div
          aria-hidden="true"
          className="mt-8 h-96 animate-pulse rounded-card border border-rule bg-paper-raised"
        />
      </PageShell>
    </>
  );
}
