/**
 * The four figures at the top of a reconciliation.
 *
 * Deliberately plain — a number and a label, no icon, no gradient, no sparkline
 * behind it. A summary card exists to be read in under a second, and every mark
 * that is not the figure competes with it.
 *
 * Monetary values arrive pre-formatted: they originate as `bigint` and cannot
 * cross into a Client Component, and converting to `number` on the way would
 * reintroduce floats into the money path.
 *
 * @see docs/DESIGN.md §S-5
 */

import { Card } from './ui';

/** One card's content. */
export interface SummaryFigure {
  readonly label: string;
  readonly value: string;
  /** Optional qualifier under the figure — a denominator, a share, a caveat. */
  readonly detail?: string;
  /**
   * Draws the figure in a semantic colour. Reserved for counts that are
   * *actionable*; a neutral figure stays ink so the coloured one still reads as
   * the exception rather than as one of four equally urgent numbers.
   */
  readonly tone?: 'unaccounted' | 'settled';
}

const TONE: Readonly<Record<'unaccounted' | 'settled', string>> = {
  unaccounted: 'text-unaccounted',
  settled: 'text-settled',
};

export function SummaryCards({ figures }: { readonly figures: readonly SummaryFigure[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {figures.map((figure) => (
        <Card key={figure.label} className="p-4 sm:p-5">
          <p className="text-xs text-ink-muted">{figure.label}</p>
          <p
            className={`mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl ${
              figure.tone === undefined ? '' : TONE[figure.tone]
            }`}
          >
            {figure.value}
          </p>
          {figure.detail !== undefined && (
            <p className="mt-1 text-xs text-ink-muted">{figure.detail}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
