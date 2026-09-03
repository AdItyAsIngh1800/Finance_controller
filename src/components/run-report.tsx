/**
 * The printable reconciliation summary.
 *
 * A controller's next step after clearing a queue is sending someone a
 * document, and a screenshot of a dashboard is not that. This renders the run
 * as a report: figures, how the pairings were made, the thresholds that
 * produced them, and every finding with its reasoning.
 *
 * **Separate markup from the interactive table, deliberately.** The queue's
 * expanded state lives in React, so printing the live DOM would produce a
 * document containing whichever rows the reader happened to have open — a
 * report that silently omits findings is worse than no report. This component
 * renders every exception in full, always, and is hidden on screen.
 *
 * **No PDF library.** The browser's own print-to-PDF is the platform feature
 * for this, and it produces a real PDF with selectable text, working links and
 * the reader's own paper size. A generated PDF would add a dependency and a
 * second layout to keep in agreement with this one.
 *
 * Colour is dropped in print (see `globals.css`): severity is carried by its
 * text label, which is why §2 requires the label in the first place — the
 * report stays correct on a monochrome office printer.
 *
 * @see docs/DESIGN.md §S-5
 */

import type { ExceptionView } from './exception-list';

/** One label-and-value pair in the report's figure block. */
function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

export function RunReport({
  datasetName,
  domain,
  runAt,
  sourceCount,
  ledgerCount,
  matchedCount,
  matchRate,
  reconciledValue,
  exceptions,
  tiers,
  thresholds,
}: {
  readonly datasetName: string;
  readonly domain: string;
  readonly runAt: string;
  readonly sourceCount: number;
  readonly ledgerCount: number;
  readonly matchedCount: number;
  readonly matchRate: number;
  readonly reconciledValue: string;
  readonly exceptions: readonly ExceptionView[];
  readonly tiers: readonly { readonly label: string; readonly count: number }[];
  readonly thresholds: readonly { readonly label: string; readonly value: string }[];
}) {
  const open = exceptions.filter((exception) => exception.status !== 'resolved').length;

  return (
    <article className="hidden print:block">
      <header className="border-b-2 border-ink pb-3">
        <h1 className="text-xl font-semibold tracking-tight">Reconciliation summary</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {datasetName} · {domain} · run {runAt}
        </p>
      </header>

      <dl className="mt-5 grid grid-cols-4 gap-4">
        <Figure label="Transactions" value={sourceCount.toLocaleString('en-IN')} />
        <Figure label="Match rate" value={`${(matchRate * 100).toFixed(1)}%`} />
        <Figure label="Exceptions open" value={String(open)} />
        <Figure label="Value reconciled" value={reconciledValue} />
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        {matchedCount.toLocaleString('en-IN')} of {sourceCount.toLocaleString('en-IN')} source
        records paired against {ledgerCount.toLocaleString('en-IN')} ledger entries.
        {exceptions.length - open > 0 &&
          ` ${exceptions.length - open} of ${exceptions.length} findings marked resolved.`}
      </p>

      <section className="mt-6">
        <h2 className="text-[10px] uppercase tracking-wider text-ink-muted">How records were paired</h2>
        <dl className="mt-1.5">
          {tiers.map((tier) => (
            <div key={tier.label} className="flex justify-between border-b border-rule py-1 text-sm">
              <dt>{tier.label}</dt>
              <dd className="font-mono">{tier.count}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-5">
        <h2 className="text-[10px] uppercase tracking-wider text-ink-muted">Thresholds applied</h2>
        <p className="mt-1 text-xs text-ink-muted">
          The values this run actually used, snapshotted when it ran — not the current defaults.
        </p>
        <dl className="mt-1.5">
          {thresholds.map((threshold) => (
            <div
              key={threshold.label}
              className="flex justify-between border-b border-rule py-1 text-sm"
            >
              <dt>{threshold.label}</dt>
              <dd className="font-mono">{threshold.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">
          Findings ({exceptions.length})
        </h2>
        {exceptions.length === 0 ? (
          <p className="mt-2 text-sm">
            Every source record found its counterpart, with no discrepancies to review.
          </p>
        ) : (
          <ol className="mt-2">
            {exceptions.map((exception) => (
              /* `break-inside-avoid` keeps a finding and its evidence on one
                 page; a reason split across a page break is how a reader ends
                 up acting on half of it. */
              <li
                key={exception.id}
                className="break-inside-avoid border-b border-rule py-3 last:border-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-semibold">
                    {exception.reference} · {exception.type}
                  </p>
                  <p className="whitespace-nowrap font-mono text-sm">{exception.amount}</p>
                </div>
                <p className="text-xs text-ink-muted">
                  {exception.date} · {exception.severity} severity · {exception.status}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{exception.statedReason}</p>

                {exception.evidence.length > 0 && (
                  <table className="mt-2 w-full max-w-lg text-xs">
                    <tbody>
                      {exception.evidence.map((line, index) => (
                        <tr key={`${line.label}-${index}`} className="border-b border-rule/60">
                          <td className="py-0.5 pr-4">{line.label}</td>
                          <td className="py-0.5 pr-4 text-right font-mono">{line.source ?? '—'}</td>
                          <td className="py-0.5 text-right font-mono">{line.ledger ?? '—'}</td>
                          <td className="py-0.5 pl-4">{line.note ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {exception.suggestedAction !== undefined && (
                  <p className="mt-1.5 text-xs text-ink-muted">{exception.suggestedAction}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="mt-8 border-t border-rule pt-3 text-xs leading-relaxed text-ink-muted">
        Produced by AI Finance Controller. Matching is deterministic and involves no model — the
        same inputs and thresholds reproduce this result exactly. This is advisory analysis, not a
        system of record: it makes no audit-trail or immutability guarantee, and nothing here has
        been written back to any accounting system.
      </footer>
    </article>
  );
}
