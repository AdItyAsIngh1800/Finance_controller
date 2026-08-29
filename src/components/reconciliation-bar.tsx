/**
 * The reconciliation bar.
 *
 * A percentage tells you the match rate; this shows you the residue. The
 * unmatched remainder is drawn at its true proportion of the whole, so nine
 * records out of two hundred and fifty reads as the thin sliver it actually is
 * rather than as an abstract 3.6%.
 *
 * That framing matters for this product specifically: the residue *is* the
 * output, and a controller's job is to work through it rather than to admire
 * the percentage above it.
 */

/**
 * @param props.matched - Source records the engine paired.
 * @param props.total - Source records in the dataset.
 */
export function ReconciliationBar({
  matched,
  total,
}: {
  readonly matched: number;
  readonly total: number;
}) {
  const settledPercent = total === 0 ? 0 : (matched / total) * 100;
  const outstanding = total - matched;

  return (
    <div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-paper-sunk"
        role="img"
        aria-label={`${matched} of ${total} source records matched, ${outstanding} outstanding`}
      >
        <div className="bg-settled" style={{ width: `${settledPercent}%` }} />
        <div className="flex-1 bg-unaccounted" />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
        <span>
          <span className="font-mono text-ink">{matched.toLocaleString()}</span> matched
        </span>
        <span>
          <span className="font-mono text-ink">{outstanding.toLocaleString()}</span> outstanding
        </span>
      </div>
    </div>
  );
}
