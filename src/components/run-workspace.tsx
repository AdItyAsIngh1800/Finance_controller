'use client';

/**
 * Holds the exception queue and the Q&A panel together.
 *
 * These two were siblings under the run page with no way to talk, which is why
 * `DESIGN.md` §S-6's "Ask about this" button — specified from the start — was
 * never built: the button lives on an exception and the answer lives in the
 * panel, and nothing owned both. This component owns the one piece of state
 * that has to cross between them.
 *
 * It is the smallest thing that works: a question and a nonce. Lifting the
 * whole conversation up here instead would make the run page re-render on every
 * keystroke in the Ask input, for no benefit — the panel is the only thing that
 * needs to know about its own history.
 *
 * @see docs/DESIGN.md §S-6, §S-7
 */

import { useState, type ReactNode } from 'react';
import { AskPanel } from './ask-panel';
import { ExceptionList, type ExceptionView } from './exception-list';
import { SummaryPanels, type PanelFilter, type SummaryPanel } from './summary-panels';

/**
 * @param props.runId - The run being viewed, for the Q&A panel's lookups.
 * @param props.exceptions - The run's findings, in engine order.
 * @param props.initialExpanded - Exception id to open on arrival.
 * @param props.panels - The headline figures, already formatted on the server.
 * @param props.children - Static server-rendered content that belongs *between*
 *   the panels and the queue: the tier and threshold read-outs, and the charts.
 *   Passed as children rather than imported so it stays a Server Component —
 *   a client parent does not force its children across the boundary, and
 *   importing the charts here would have pulled Recharts into this bundle.
 */
export function RunWorkspace({
  runId,
  exceptions,
  initialExpanded,
  panels,
  children,
}: {
  readonly runId: string;
  readonly exceptions: readonly ExceptionView[];
  readonly initialExpanded?: string | null;
  readonly panels: readonly SummaryPanel[];
  readonly children?: ReactNode;
}) {
  const [seed, setSeed] = useState<{ nonce: number; question: string } | undefined>(undefined);
  /**
   * Which summary panel is picked up, or `null` when none is.
   *
   * Owned here for the same reason `seed` is: the panel that sets it and the
   * queue that reads it are siblings, and this component exists to be the one
   * place a value crossing between them can live.
   */
  const [panelFilter, setPanelFilter] = useState<PanelFilter | null>(null);

  /**
   * Sends a question about one finding to the panel.
   *
   * The nonce increments so that asking the same thing twice still fires; the
   * panel compares nonces rather than text for exactly that reason.
   */
  const askAbout = (question: string): void => {
    setSeed((current) => ({ nonce: (current?.nonce ?? 0) + 1, question }));
  };

  return (
    <>
      <div className="mt-4 print:hidden">
        <SummaryPanels panels={panels} active={panelFilter} onFilter={setPanelFilter} />
      </div>
      {children}
      <ExceptionList
        exceptions={exceptions}
        initialExpanded={initialExpanded ?? null}
        onAskAbout={askAbout}
        panelFilter={panelFilter}
      />
      <AskPanel runId={runId} seed={seed} />
    </>
  );
}
