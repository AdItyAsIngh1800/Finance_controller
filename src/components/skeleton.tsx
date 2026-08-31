/**
 * Loading placeholders.
 *
 * Shaped like the content they stand in for, so the layout does not jump when
 * real data replaces them. A spinner in the middle of an empty page tells a
 * reader nothing about what is coming; a table-shaped skeleton does.
 *
 * @see docs/DESIGN.md §5 — cross-cutting states
 */

/** A single muted bar. */
function Bar({ className = '' }: { readonly className?: string }) {
  return <span className={`block h-3 animate-pulse rounded-sm bg-paper-sunk ${className}`} />;
}

/**
 * Rows standing in for a table.
 *
 * @param props.rows - How many placeholder rows to draw.
 * @param props.columns - Relative widths, as Tailwind width classes.
 */
export function TableSkeleton({
  rows = 6,
  columns = ['w-40', 'w-24', 'w-24', 'w-56'],
}: {
  readonly rows?: number;
  readonly columns?: readonly string[];
}) {
  return (
    <div aria-hidden="true" className="mt-2">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 border-b border-rule py-3">
          {columns.map((width, columnIndex) => (
            <Bar key={columnIndex} className={width} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A block standing in for a heading and its surrounding prose. */
export function HeaderSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <Bar className="h-6 w-64" />
      <Bar className="w-80" />
    </div>
  );
}

/**
 * The announcement screen readers hear while a route resolves.
 *
 * The skeleton itself is `aria-hidden`; decorative bars read as noise. This
 * carries the actual status.
 */
export function LoadingAnnouncement({ label }: { readonly label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}
