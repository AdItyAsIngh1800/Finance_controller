/** Shown while a dataset and its run history resolve. */
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <LoadingAnnouncement label="Loading this dataset" />
      <HeaderSkeleton />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-sm border border-rule bg-paper-sunk/40" />
        <div className="h-40 animate-pulse rounded-sm border border-rule bg-paper-sunk/40" />
      </div>
      <TableSkeleton rows={3} columns={['w-32', 'w-16', 'w-28']} />
    </main>
  );
}
