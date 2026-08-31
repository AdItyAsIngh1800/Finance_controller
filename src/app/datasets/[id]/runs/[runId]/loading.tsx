/** Shown while a reconciliation run resolves. */
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <LoadingAnnouncement label="Loading reconciliation results" />
      <HeaderSkeleton />
      {/* Sized like the match-rate figure, so the headline does not jump. */}
      <div className="mt-8 h-20 w-56 animate-pulse rounded-sm bg-paper-sunk" aria-hidden="true" />
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <TableSkeleton key={column} rows={4} columns={['w-28', 'w-10']} />
        ))}
      </div>
      <TableSkeleton rows={8} columns={['w-16', 'w-44', 'w-24', 'w-64']} />
    </main>
  );
}
