'use client';

/**
 * The exception queue (docs/DESIGN.md §S-6).
 *
 * This is the product. Everything else on the page is navigation to it.
 *
 * Rows are ordered by the engine — highest severity first, then largest amount —
 * so the costliest unexplained gaps sit at the top. Expanding a row shows both
 * sides of the comparison with the differing line marked, because the
 * comparison *is* the explanation.
 *
 * Monetary values arrive pre-formatted: they originate as `bigint`, which
 * cannot cross the server/client boundary, and converting to `number` here
 * would reintroduce floats into the money path.
 */

import { useMemo, useState } from 'react';
import { SeverityBadge } from './severity';
import type { Severity } from '@/core/taxonomy';

/** One line of the side-by-side comparison, already formatted for display. */
export interface EvidenceView {
  readonly label: string;
  readonly source?: string;
  readonly ledger?: string;
  readonly note?: string;
}

/** An exception as rendered. */
export interface ExceptionView {
  readonly id: string;
  readonly type: string;
  readonly severity: Severity;
  readonly reference: string;
  readonly summary: string;
  readonly statedReason: string;
  readonly suggestedAction?: string;
  readonly evidence: readonly EvidenceView[];
}

/** Filter value meaning "no filter applied". */
const ALL = '__all__';

export function ExceptionList({ exceptions }: { readonly exceptions: readonly ExceptionView[] }) {
  const [type, setType] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<string | null>(null);

  const types = useMemo(
    () => [...new Set(exceptions.map((exception) => exception.type))].sort(),
    [exceptions],
  );

  const visible = exceptions.filter(
    (exception) =>
      (type === ALL || exception.type === type) &&
      (severity === ALL || exception.severity === severity),
  );

  if (exceptions.length === 0) {
    // A genuine success state, not an empty table.
    return (
      <div className="border-t border-rule-strong py-16 text-center">
        <p className="text-sm font-medium">Everything reconciled.</p>
        <p className="mt-1 text-sm text-ink-muted">
          Every source record found its counterpart, with no discrepancies to review.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-strong pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Exceptions
          <span className="ml-2 font-mono text-ink">{exceptions.length}</span>
        </h2>
        <div className="flex gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-ink-muted">Type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="rounded-sm border border-rule bg-paper px-2 py-1"
            >
              <option value={ALL}>All</option>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-ink-muted">Severity</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="rounded-sm border border-rule bg-paper px-2 py-1"
            >
              <option value={ALL}>All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          No exceptions match this filter. Clear it to see all {exceptions.length}.
        </p>
      ) : (
        <ul>
          {visible.map((exception) => {
            const isOpen = expanded === exception.id;
            return (
              <li key={exception.id} className="border-b border-rule">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : exception.id)}
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-paper-sunk"
                >
                  <span aria-hidden="true" className="w-3 text-ink-faint">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <SeverityBadge severity={exception.severity} />
                  <span className="w-52 shrink-0 font-mono text-xs text-ink-muted">
                    {exception.type}
                  </span>
                  <span className="w-28 shrink-0 font-mono text-sm">{exception.reference}</span>
                  <span className="flex-1 truncate text-sm text-ink-muted">
                    {exception.summary}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-rule bg-paper-sunk/60 px-8 py-5">
                    <p className="max-w-2xl text-sm leading-relaxed">{exception.statedReason}</p>

                    {exception.evidence.length > 0 && (
                      <table className="mt-4 text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wider text-ink-muted">
                            <th scope="col" className="py-1 pr-8 text-left font-medium">
                              Evidence
                            </th>
                            <th scope="col" className="py-1 pr-8 text-right font-medium">
                              Source
                            </th>
                            <th scope="col" className="py-1 pr-8 text-right font-medium">
                              Ledger
                            </th>
                            <th scope="col" className="py-1 text-left font-medium" />
                          </tr>
                        </thead>
                        <tbody>
                          {exception.evidence.map((line, index) => (
                            <tr
                              key={`${line.label}-${index}`}
                              className={line.note === undefined ? '' : 'text-unaccounted'}
                            >
                              <td className="py-1 pr-8">{line.label}</td>
                              <td className="py-1 pr-8 text-right font-mono">
                                {line.source ?? '—'}
                              </td>
                              <td className="py-1 pr-8 text-right font-mono">
                                {line.ledger ?? '—'}
                              </td>
                              <td className="py-1 text-xs">
                                {line.note === undefined ? '' : `← ${line.note}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {exception.suggestedAction !== undefined && (
                      <p className="mt-4 text-sm text-ink-muted">
                        <span className="font-medium text-ink">Next: </span>
                        {exception.suggestedAction}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
