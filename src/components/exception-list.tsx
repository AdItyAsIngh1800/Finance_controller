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
import { Button, Card, EmptyState, InlineSelect, SectionHeading } from './ui';
import { toCsv } from '@/core/generate/csv';
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

/**
 * Hands the reader the rows they are looking at, as a file.
 *
 * Clearing a queue continues in a spreadsheet — assigning owners, chasing the
 * counterparty, marking off what has been resolved — and none of that belongs
 * in a one-week build. Exporting is the seam: it ends this tool's
 * responsibility at the point where the work leaves it. It is not write-back
 * (`PRD.md` §6), which is about modifying accounting systems.
 *
 * Takes the *filtered* rows, never the full set. Someone who has narrowed to
 * high-severity amount mismatches and clicks export means those, and a file
 * that silently contained everything would be discovered as wrong only after
 * the numbers had been used.
 *
 * The evidence lines are flattened to one column rather than exploded into rows
 * per line: a spreadsheet user wants one row per exception to sort and filter,
 * and the evidence is context they read once they have found the row.
 *
 * @param rows - The exceptions currently visible, in display order.
 * @returns CSV text with a header row.
 */
function exceptionsToCsv(rows: readonly ExceptionView[]): string {
  return toCsv([
    ['reference', 'type', 'severity', 'stated_reason', 'suggested_action', 'evidence'],
    ...rows.map((row) => [
      row.reference,
      row.type,
      row.severity,
      row.statedReason,
      row.suggestedAction ?? '',
      row.evidence
        .map((line) =>
          [line.label, line.source ?? '—', line.ledger ?? '—'].join(' ')
            + (line.note === undefined ? '' : ` (${line.note})`),
        )
        .join('; '),
    ]),
  ]);
}

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

  /**
   * Downloads the visible rows.
   *
   * Built and revoked in the handler rather than held in state: the blob is
   * only alive for the length of one click, and an object URL kept across
   * renders is a leak that never announces itself.
   */
  const downloadCsv = (): void => {
    const blob = new Blob([exceptionsToCsv(visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'exceptions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

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
            {/* Labelled by what lands on disk, not by the mechanism: the count
                is the whole question a reader has before clicking, and it
                changes with the filters beside it. */}
            <Button variant="quiet" size="sm" onClick={downloadCsv} disabled={visible.length === 0}>
              Export {visible.length} to CSV
            </Button>
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
