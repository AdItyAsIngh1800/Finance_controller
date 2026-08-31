/** Shown while the review queue resolves. */
import { HeaderSkeleton, LoadingAnnouncement } from '@/components/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <LoadingAnnouncement label="Loading documents awaiting review" />
      <HeaderSkeleton />
      <div
        aria-hidden="true"
        className="mt-8 h-96 animate-pulse rounded-sm border border-rule bg-paper-sunk/40"
      />
    </main>
  );
}
