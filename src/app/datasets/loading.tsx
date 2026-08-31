/** Shown while the dataset list resolves. */
import { HeaderSkeleton, LoadingAnnouncement, TableSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <LoadingAnnouncement label="Loading your datasets" />
      <HeaderSkeleton />
      <TableSkeleton columns={['w-48', 'w-24', 'w-16', 'w-24']} />
    </main>
  );
}
