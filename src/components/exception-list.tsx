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
 * Rebuilt as a table on 3 September 2026. It had drifted from §S-6, whose own
 * mock carries the figure on the row (`ORD-4471  ₹800.50 vs ₹1,212.50`) while
 * the implementation showed only a prose summary. For a tool whose second
 * design principle is that money is always monospaced and right-aligned, a
 * queue with no amounts in it was the wrong shape.
 *
 * Monetary values arrive pre-formatted: they originate as `bigint`, which
 * cannot cross the server/client boundary, and converting to `number` here
 * would reintroduce floats into the money path.
 */

import { useMemo, useState, useTransition } from 'react';
import { SeverityBadge } from './severity';
import { Button, Card, EmptyState, InlineSelect, Notice, SectionHeading, TableScroller } from './ui';
import { setExceptionStatus } from '@/app/actions/exception-status';
import { toCsv } from '@/core/generate/csv';
import type { Severity } from '@/core/taxonomy';

/** One line of the side-by-side comparison, already formatted for display. */
export interface EvidenceView {
  readonly label: string;
  readonly source?: string;
  readonly ledger?: string;
  readonly note?: string;
}

/** Where a finding sits in a reviewer's workflow. Mirrors the Postgres enum. */
export type ExceptionStatus = 'flagged' | 'reviewing' | 'resolved';

/** An exception as rendered. */
export interface ExceptionView {
  readonly id: string;
  readonly type: string;
  readonly severity: Severity;
  readonly status: ExceptionStatus;
  readonly reference: string;
  /** Date of the underlying record, or `—` when neither side carries one. */
  readonly date: string;
  /** Pre-formatted amount of the underlying record, or `—`. */
  readonly amount: string;
  /**
   * Extraction confidence for the record behind this finding, pre-formatted.
   * Absent for CSV-loaded records: nothing was inferred, so there is no
   * confidence to report, and printing `1.00` would claim a certainty the
   * pipeline never asserted.
   */
  readonly confidence?: string;
  readonly summary: string;
  readonly statedReason: string;
  readonly suggestedAction?: string;
  readonly evidence: readonly EvidenceView[];
}

/** Filter value meaning "no filter applied". */
const ALL = '__all__';

/** Human labels and colour for each workflow state. */
const STATUS_META: Readonly<
  Record<ExceptionStatus, { readonly label: string; readonly className: string }>
> = {
  flagged: { label: 'Flagged', className: 'bg-unaccounted-wash text-unaccounted' },
  reviewing: { label: 'Reviewing', className: 'bg-undecided-wash text-undecided' },
  resolved: { label: 'Resolved', className: 'bg-settled-wash text-settled' },
};

/** The order a reviewer moves through. */
const STATUS_ORDER: readonly ExceptionStatus[] = ['flagged', 'reviewing', 'resolved'];

/**
 * Hands the reader the rows they are looking at, as a file.
 *
 * Clearing a queue continues in a spreadsheet, and none of that workflow belongs
 * in a one-week build. Exporting is the seam: it ends this tool's responsibility
 * at the point where the work leaves it. It is not write-back (`PRD.md` §6),
 * which is about modifying accounting systems.
 *
 * Takes the *filtered* rows, never the full set. Someone who has narrowed to
 * high-severity amount mismatches and clicks export means those, and a file
 * that silently contained everything would be discovered as wrong only after
 * the numbers had been used.
 *
 * @param rows - The exceptions currently visible, in display order.
 * @returns CSV text with a header row.
 */
function exceptionsToCsv(rows: readonly ExceptionView[]): string {
  return toCsv([
    [
      'date',
      'reference',
      'amount',
      'type',
      'severity',
      'status',
      'confidence',
      'stated_reason',
      'suggested_action',
      'evidence',
    ],
    ...rows.map((row) => [
      row.date,
      row.reference,
      row.amount,
      row.type,
      row.severity,
      row.status,
      row.confidence ?? '',
      row.statedReason,
      row.suggestedAction ?? '',
      row.evidence
        .map(
          (line) =>
            [line.label, line.source ?? '—', line.ledger ?? '—'].join(' ') +
            (line.note === undefined ? '' : ` (${line.note})`),
        )
        .join('; '),
    ]),
  ]);
}

/**
 * @param props.exceptions - The run's findings, in engine order.
 * @param props.initialExpanded - Exception id to open on arrival, from
 *   `?exception=` on the page. Resolved on the server so the row is open in the
 *   first paint rather than after hydration.
 * @param props.onAskAbout - Sends a question about one finding to the Q&A
 *   panel. Supplied by `RunWorkspace`, which owns the state crossing between
 *   the two components.
 */
export function ExceptionList({
  exceptions,
  initialExpanded = null,
  onAskAbout,
}: {
  readonly exceptions: readonly ExceptionView[];
  readonly initialExpanded?: string | null;
  readonly onAskAbout?: (question: string) => void;
}) {
  const [type, setType] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);
  /**
   * Statuses changed in this session, layered over the server's values.
   *
   * The row updates the instant it is clicked rather than after a round trip: a
   * reviewer marking off nine findings should not wait on nine requests. The
   * server action still runs, and a failure puts the row back and surfaces the
   * reason — an optimistic update that cannot fail loudly is a lie about what
   * was saved.
   */
  const [localStatus, setLocalStatus] = useState<Readonly<Record<string, ExceptionStatus>>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const types = useMemo(
    () => [...new Set(exceptions.map((exception) => exception.type))].sort(),
    [exceptions],
  );

  const statusOf = (exception: ExceptionView): ExceptionStatus =>
    localStatus[exception.id] ?? exception.status;

  const visible = exceptions.filter(
    (exception) =>
      (type === ALL || exception.type === type) &&
      (severity === ALL || exception.severity === severity) &&
      (status === ALL || statusOf(exception) === status),
  );

  /** Advances a finding to the next workflow state, wrapping at the end. */
  const cycleStatus = (exception: ExceptionView): void => {
    const current = statusOf(exception);
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    if (next === undefined) return;

    setLocalStatus((map) => ({ ...map, [exception.id]: next }));
    setError(null);
    startTransition(() => {
      void setExceptionStatus(exception.id, next).then((result) => {
        if (result.ok) return;
        setLocalStatus((map) => ({ ...map, [exception.id]: current }));
        setError(result.error);
      });
    });
  };

  /**
   * Downloads the visible rows.
   *
   * Built and revoked in the handler rather than held in state: the blob is
   * only alive for the length of one click, and an object URL kept across
   * renders is a leak that never announces itself.
   */
  const downloadCsv = (): void => {
    const rows = visible.map((row) => ({ ...row, status: statusOf(row) }));
    const blob = new Blob([exceptionsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'exceptions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Opens or closes a finding, and writes the choice into the URL.
   *
   * `history.replaceState` rather than a router navigation: expanding a row is
   * not a new destination, and routing would re-run the server component to
   * change one boolean. It also keeps the Back button meaning "the page I came
   * from" instead of "the row I last collapsed".
   */
  const toggle = (id: string): void => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    const url = new URL(window.location.href);
    if (next === null) {
      url.searchParams.delete('exception');
    } else {
      url.searchParams.set('exception', next);
    }
    window.history.replaceState(null, '', url);
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
            <InlineSelect label="Type" value={type} onChange={(e) => setType(e.target.value)}>
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
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value={ALL}>All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </InlineSelect>
            <InlineSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={ALL}>All</option>
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </InlineSelect>
            <Button variant="quiet" size="sm" onClick={downloadCsv} disabled={visible.length === 0}>
              Export {visible.length} to CSV
            </Button>
          </div>
        }
      >
        Exceptions
        <span className="ml-2 font-mono text-ink">{exceptions.length}</span>
      </SectionHeading>

      {error !== null && (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          No exceptions match this filter. Clear it to see all {exceptions.length}.
        </p>
      ) : (
        <Card className="mt-3 overflow-hidden">
          {/* Seven columns that mean nothing apart from each other, so the
              table scrolls within its card below the width they fit in rather
              than reflowing into stacked pairs. */}
          <TableScroller label="Exception queue">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-rule bg-paper-sunk/60 text-[11px] uppercase tracking-wider text-ink-muted">
                  <th scope="col" className="w-8 py-2 pl-3" />
                  <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Reference</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Reason</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Confidence</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((exception) => (
                  <ExceptionRow
                    key={exception.id}
                    exception={exception}
                    status={statusOf(exception)}
                    isOpen={expanded === exception.id}
                    onToggle={() => toggle(exception.id)}
                    onCycleStatus={() => cycleStatus(exception)}
                    {...(onAskAbout === undefined ? {} : { onAskAbout })}
                  />
                ))}
              </tbody>
            </table>
          </TableScroller>
        </Card>
      )}
    </section>
  );
}

/** One finding: a summary row, and its evidence when expanded. */
function ExceptionRow({
  exception,
  status,
  isOpen,
  onToggle,
  onCycleStatus,
  onAskAbout,
}: {
  readonly exception: ExceptionView;
  readonly status: ExceptionStatus;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onCycleStatus: () => void;
  readonly onAskAbout?: (question: string) => void;
}) {
  const meta = STATUS_META[status];

  return (
    <>
      <tr className="border-b border-rule transition-colors duration-150 ease-ui hover:bg-paper-sunk/50">
        <td className="py-2 pl-3">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={onToggle}
            className="rounded-control px-1 py-1 text-ink-faint transition-colors duration-150 ease-ui hover:text-ink"
          >
            <span
              aria-hidden="true"
              className={`inline-block transition-transform duration-150 ease-ui ${isOpen ? 'rotate-90' : ''}`}
            >
              ▸
            </span>
            <span className="sr-only">
              {isOpen ? 'Hide' : 'Show'} evidence for {exception.reference}
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-muted">
          {exception.date}
        </td>
        <td className="whitespace-nowrap px-3 py-2 font-mono text-sm font-medium">
          {exception.reference}
        </td>
        {/* Right-aligned and monospaced, always — DESIGN.md §2. */}
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{exception.amount}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={exception.severity} />
            <span className="whitespace-nowrap font-mono text-[11px] text-ink-muted">
              {exception.type}
            </span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-ink-muted">
          {exception.confidence ?? '—'}
        </td>
        <td className="px-3 py-2">
          {/*
            A button, not a select. There are three states in a fixed order and
            the common action is "advance this one", which is one click here and
            three interactions in a dropdown. The label is the current state, so
            the control reads as status first and affordance second.
          */}
          <button
            type="button"
            onClick={onCycleStatus}
            className={`whitespace-nowrap rounded-control px-2 py-1 text-[11px] font-medium transition-opacity duration-150 ease-ui hover:opacity-80 ${meta.className}`}
          >
            {meta.label}
            <span className="sr-only">. Change status of {exception.reference}</span>
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {onAskAbout !== undefined && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() =>
                onAskAbout(`Why was ${exception.reference} flagged as ${exception.type}?`)
              }
            >
              Ask about this
            </Button>
          )}
        </td>
      </tr>

      {isOpen && (
        <tr className="border-b border-rule">
          <td colSpan={8} className="bg-paper-sunk/50 px-4 py-5 sm:px-8">
            <p className="prose-measure text-sm leading-relaxed">{exception.statedReason}</p>

            {exception.evidence.length > 0 && (
              <TableScroller label={`Evidence for ${exception.reference}`}>
                <table className="mt-4 w-full min-w-[22rem] max-w-xl text-sm">
                  <thead>
                    <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-muted">
                      <th scope="col" className="py-1.5 pr-6 text-left font-medium">Evidence</th>
                      <th scope="col" className="py-1.5 pr-6 text-right font-medium">Source</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Ledger</th>
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
                        <td className="py-1.5 pr-6 text-right font-mono">{line.source ?? '—'}</td>
                        <td className="py-1.5 text-right font-mono">{line.ledger ?? '—'}</td>
                        <td className="whitespace-nowrap py-1.5 pl-6 text-xs">
                          {line.note === undefined ? '' : `← ${line.note}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroller>
            )}

            {exception.suggestedAction !== undefined && (
              <p className="prose-measure mt-4 text-sm text-ink-muted">
                {exception.suggestedAction}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
