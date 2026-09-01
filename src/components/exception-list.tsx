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
import { Card, EmptyState, InlineSelect, SectionHeading } from './ui';
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
      <section className="mt-10">
        <EmptyState title="Everything reconciled.">
          Every source record found its counterpart, with no discrepancies to review.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <SectionHeading
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <InlineSelect
              label="Type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value={ALL}>All</option>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label="Severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value={ALL}>All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </InlineSelect>
          </div>
        }
      >
        Exceptions
        <span className="ml-2 font-mono text-ink">{exceptions.length}</span>
      </SectionHeading>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          No exceptions match this filter. Clear it to see all {exceptions.length}.
        </p>
      ) : (
        <Card className="mt-3 overflow-hidden">
          <ul>
            {visible.map((exception) => {
              const isOpen = expanded === exception.id;
              return (
                <li key={exception.id} className="border-b border-rule last:border-0">
                  {/*
                    The trigger reflows rather than scrolling sideways.

                    From `md` the columns are fixed-width so references and
                    amounts stay aligned down the list, which is what makes the
                    queue scannable. Below that the fixed widths would exceed
                    the viewport, so the row wraps into two lines instead —
                    identity on the first, summary on the second.
                  */}
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : exception.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-3 text-left transition-colors duration-150 ease-ui hover:bg-paper-sunk/60 md:flex-nowrap md:px-4"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-3 shrink-0 text-ink-faint transition-transform duration-150 ease-ui ${
                        isOpen ? 'rotate-90' : ''
                      }`}
                    >
                      ▸
                    </span>
                    <SeverityBadge severity={exception.severity} />
                    <span className="shrink-0 font-mono text-xs text-ink-muted md:w-52">
                      {exception.type}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-medium md:w-28">
                      {exception.reference}
                    </span>
                    <span className="w-full text-sm text-ink-muted md:w-auto md:flex-1 md:truncate">
                      {exception.summary}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-rule bg-paper-sunk/50 px-4 py-5 sm:px-8">
                      <p className="prose-measure text-sm leading-relaxed">
                        {exception.statedReason}
                      </p>

                      {exception.evidence.length > 0 && (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full min-w-[22rem] max-w-xl text-sm">
                            <thead>
                              <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-muted">
                                <th scope="col" className="py-1.5 pr-6 text-left font-medium">
                                  Evidence
                                </th>
                                <th scope="col" className="py-1.5 pr-6 text-right font-medium">
                                  Source
                                </th>
                                <th scope="col" className="py-1.5 text-right font-medium">
                                  Ledger
                                </th>
                                <th scope="col" className="py-1.5 pl-6 text-left font-medium" />
                              </tr>
                            </thead>
                            <tbody>
                              {exception.evidence.map((line, index) => (
                                <tr
                                  key={`${line.label}-${index}`}
                                  className={
                                    line.note === undefined
                                      ? 'border-b border-rule/60 last:border-0'
                                      : 'border-b border-rule/60 font-medium text-unaccounted last:border-0'
                                  }
                                >
                                  <td className="py-1.5 pr-6">{line.label}</td>
                                  <td className="py-1.5 pr-6 text-right font-mono">
                                    {line.source ?? '—'}
                                  </td>
                                  <td className="py-1.5 text-right font-mono">
                                    {line.ledger ?? '—'}
                                  </td>
                                  <td className="whitespace-nowrap py-1.5 pl-6 text-xs">
                                    {line.note === undefined ? '' : `← ${line.note}`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {exception.suggestedAction !== undefined && (
                        <p className="prose-measure mt-4 text-sm text-ink-muted">
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
        </Card>
      )}
    </section>
  );
}
