'use client';

/**
 * The grounded Q&A panel (docs/DESIGN.md §S-7).
 *
 * The function-call trace is rendered **above** each answer, not tucked behind a
 * disclosure. It is the evidence that the answer came from the reconciliation
 * data rather than from the model's imagination, and for this project's central
 * claim that makes it the most important thing on the screen. Hiding it would
 * turn "check me" back into "trust me".
 *
 * A refusal renders as an ordinary answer, not an error. Declining a question
 * the data cannot support is correct behaviour, and styling it as a failure
 * would teach the reader to read it as one.
 */

import { useState } from 'react';

/** One function the agent called. */
interface AgentCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** One exchange in the conversation. */
interface Exchange {
  readonly question: string;
  readonly answer: string;
  readonly calls: readonly AgentCall[];
  readonly declined: boolean;
  readonly failed: boolean;
}

/** Starting points, one per demo-script question. */
const SUGGESTIONS = [
  'Why was the payout for ORD-4471 short by ₹412?',
  'What was the match rate, and how many exceptions were raised?',
  'Which exceptions are the most serious?',
] as const;

export function AskPanel({ runId }: { readonly runId: string }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState('');
  const [thinking, setThinking] = useState(false);

  const ask = async (text: string): Promise<void> => {
    const asked = text.trim();
    if (asked.length === 0 || thinking) return;
    setThinking(true);
    setQuestion('');

    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, question: asked }),
    });
    // The endpoint returns an AgentAnswer, whose prose field is `text`. Typing
    // this response explicitly rather than as Partial<Exchange> is deliberate:
    // the two shapes differ by exactly one field name, and reading the wrong one
    // fails silently — the trace renders, the answer does not, and nothing
    // errors.
    const payload = (await response.json()) as {
      text?: string;
      calls?: AgentCall[];
      declined?: boolean;
      failed?: boolean;
      error?: string;
    };

    setExchanges((current) => [
      ...current,
      {
        question: asked,
        answer: payload.text ?? payload.error ?? 'No answer was returned.',
        calls: payload.calls ?? [],
        declined: payload.declined ?? false,
        failed: payload.failed ?? !response.ok,
      },
    ]);
    setThinking(false);
  };

  return (
    <section className="mt-12 border-t border-rule-strong pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Ask about this reconciliation
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Answers come only from the results above. Every figure is quoted from a lookup, never
        calculated — and the lookups are shown.
      </p>

      {exchanges.length === 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => void ask(suggestion)}
                className="rounded-sm border border-rule bg-paper px-3 py-1.5 text-left text-xs transition hover:bg-paper-sunk"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-6 space-y-6">
        {exchanges.map((exchange, index) => (
          <li key={`${exchange.question}-${index}`}>
            <p className="text-sm font-medium">{exchange.question}</p>

            {exchange.calls.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {exchange.calls.map((call, callIndex) => (
                  <li
                    key={`${call.name}-${callIndex}`}
                    className="font-mono text-[11px] text-ink-faint"
                  >
                    <span aria-hidden="true">⚙ </span>
                    {call.name}(
                    {Object.entries(call.args)
                      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                      .join(', ')}
                    )
                  </li>
                ))}
              </ul>
            )}

            <p
              className={`mt-2 max-w-2xl border-l-2 pl-3 text-sm leading-relaxed ${
                exchange.failed
                  ? 'border-unaccounted text-unaccounted'
                  : exchange.declined
                    ? 'border-rule-strong text-ink-muted'
                    : 'border-settled'
              }`}
            >
              {exchange.answer}
            </p>
          </li>
        ))}
      </ol>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="mt-6 flex gap-2"
      >
        <label className="flex-1">
          <span className="sr-only">Ask a question about this reconciliation</span>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={thinking ? 'Looking…' : 'Ask a follow-up…'}
            disabled={thinking}
            className="w-full rounded-sm border border-rule bg-paper px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={thinking || question.trim().length === 0}
          className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
