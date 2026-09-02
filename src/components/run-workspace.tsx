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

import { useState } from 'react';
import { AskPanel } from './ask-panel';
import { ExceptionList, type ExceptionView } from './exception-list';

export function RunWorkspace({
  runId,
  exceptions,
  initialExpanded,
}: {
  readonly runId: string;
  readonly exceptions: readonly ExceptionView[];
  readonly initialExpanded?: string | null;
}) {
  const [seed, setSeed] = useState<{ nonce: number; question: string } | undefined>(undefined);

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
      <ExceptionList
        exceptions={exceptions}
        initialExpanded={initialExpanded ?? null}
        onAskAbout={askAbout}
      />
      <AskPanel runId={runId} seed={seed} />
    </>
  );
}
