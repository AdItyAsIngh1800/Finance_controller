/** Shown while the account and threshold panels resolve. */
import { AppShell } from '@/components/app-sidebar';
import { HeaderSkeleton, LoadingAnnouncement } from '@/components/skeleton';
import { PageShell } from '@/components/ui';

export default function Loading() {
  return (
    <AppShell>
      <PageShell>
        <LoadingAnnouncement label="Loading your settings" />
        <HeaderSkeleton />
        {/* Two stacked panels rather than a table: this screen is definition
            lists, and a table skeleton here would promise the wrong shape. */}
        {[0, 1].map((slot) => (
          <div
            key={slot}
            aria-hidden="true"
            className="mt-8 h-44 animate-pulse rounded-card border border-rule bg-paper-raised"
          />
        ))}
      </PageShell>
    </AppShell>
  );
}
