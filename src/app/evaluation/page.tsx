/**
 * Public accuracy report (docs/DESIGN.md §S-8).
 *
 * Reachable without signing in, deliberately: it exposes no user data and
 * answers the question a reviewer most wants answered — *how do you know it's
 * right?* — without making them create an account first.
 *
 * The engine figures come from a real reconciliation run rather than a stored
 * constant. The page prerenders, so that run happens at build time — which
 * changes nothing about the figures, because the generators are seeded and pure
 * and every run produces byte-identical data.
 */

import Link from 'next/link';
import {
  computeScorecards,
  EXTRACTION_RESULTS,
  GROUNDING_RESULTS,
  KNOWN_LIMITATIONS,
  type DomainScorecard,
} from '@/lib/evaluation';

/** Human labels for match tiers. */
const TIER_LABELS: Readonly<Record<string, string>> = {
  EXACT_REF: 'Exact reference',
  EXACT_AMOUNT_DATE: 'Amount and date',
  FUZZY_REF: 'Similar reference',
  PARTIAL_SET: 'Combined payments',
};

export default function EvaluationPage() {
  const scorecards = computeScorecards();
  const totalFalseMatches = scorecards.reduce(
    (count, card) => count + card.score.falseMatches.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">How do you know it&rsquo;s right?</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        The data generator plants discrepancies deliberately and records exactly what it planted,
        so the engine&rsquo;s output is scored against a known answer rather than eyeballed. The
        figures below come from actually running the engine, not from a stored number &mdash; the
        generators are seeded, so the same run reproduces them exactly.
      </p>

      {/* The headline is not the match rate. A tool can score 100% by matching
          everything to anything; what it cannot fake is never mismatching. */}
      <section className="mt-10 border-y border-rule-strong py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          False matches
        </p>
        <p className="mt-1 font-mono text-6xl font-medium tracking-tight">{totalFalseMatches}</p>
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          A record pair the ground truth says should not match, which the engine matched anyway.
          This is the metric that matters most: a false exception costs a reviewer thirty seconds,
          whereas a false match silently hides the discrepancy this tool exists to catch. The two
          errors are not symmetric, and the thresholds do not treat them as such — recall may miss
          5%, this must be zero.
        </p>
      </section>

      {scorecards.map((card) => (
        <Scorecard key={card.domain} card={card} />
      ))}

      <section className="mt-12">
        <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Document extraction
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          Measured {EXTRACTION_RESULTS.measuredOn} against{' '}
          <span className="font-mono">{EXTRACTION_RESULTS.model}</span>, on statements rendered
          from records whose correct values were already known.
        </p>
        <dl className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Figure label="Field accuracy, clean scan" value={EXTRACTION_RESULTS.cleanAccuracy} />
          <Figure label="Field accuracy, degraded scan" value={EXTRACTION_RESULTS.degradedAccuracy} />
          <Figure
            label="Mean confidence, clean"
            value={EXTRACTION_RESULTS.cleanConfidence.toFixed(2)}
          />
          <Figure
            label="Mean confidence, degraded"
            value={EXTRACTION_RESULTS.degradedConfidence.toFixed(2)}
          />
        </dl>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">
          <span className="font-medium">The second column is the one that matters.</span> On a
          deliberately degraded scan the model read every figure wrong — and reported{' '}
          {EXTRACTION_RESULTS.degradedConfidence.toFixed(2)} confidence, below the{' '}
          {EXTRACTION_RESULTS.threshold} threshold, so the record was blocked from the ledger
          instead of entering reconciliation as plausible-looking wrong numbers. A model that were
          highly accurate with flat confidence would be less useful here, because only informative
          confidence can be gated.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Answer grounding
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          Measured {GROUNDING_RESULTS.measuredOn}. {GROUNDING_RESULTS.questionsAsked} adversarial
          questions — some the data supports, some it cannot, two phrased to bait arithmetic or a
          forecast.
        </p>
        <dl className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Figure label="Ungrounded figures" value={String(GROUNDING_RESULTS.ungroundedFigures)} />
          <Figure label="Unanswerable questions declined" value={GROUNDING_RESULTS.refusalsCorrect} />
        </dl>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">
          Every monetary amount quoted in an answer is checked against a transcript of what the
          lookup functions actually returned. A figure the model produced but no function supplied
          is caught however plausible it reads — which is the only way to catch a failure whose
          whole character is looking correct.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          What this does not establish
        </h2>
        <ul className="mt-4 max-w-2xl space-y-3">
          {KNOWN_LIMITATIONS.map((limitation) => (
            <li key={limitation} className="border-l-2 border-rule pl-3 text-sm leading-relaxed">
              {limitation}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 border-t border-rule pt-4 text-xs text-ink-muted">
        Reproduce these figures with <span className="font-mono">npm run scorecard</span>,{' '}
        <span className="font-mono">npm run extraction:report</span>, and{' '}
        <span className="font-mono">npm run grounding:report</span>.{' '}
        <Link href="/" className="underline underline-offset-2">
          Back to the app
        </Link>
      </p>
    </main>
  );
}

/** One domain's precision and recall table. */
function Scorecard({ card }: { readonly card: DomainScorecard }) {
  const scored = card.score.byType.filter((row) => row.planted > 0 || row.reported > 0);

  return (
    <section className="mt-12">
      <h2 className="flex items-baseline justify-between border-b border-rule-strong pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        <span>{card.domain} domain</span>
        <span className="font-mono normal-case tracking-normal">
          {((card.matchedCount / card.sourceCount) * 100).toFixed(1)}% matched ·{' '}
          {card.durationMs.toFixed(0)} ms
        </span>
      </h2>

      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-muted">
              <th scope="col" className="py-1.5 text-left font-medium">
                Exception type
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">Planted</th>
              <th scope="col" className="py-1.5 text-right font-medium">Reported</th>
              <th scope="col" className="py-1.5 text-right font-medium">Precision</th>
              <th scope="col" className="py-1.5 text-right font-medium">Recall</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((row) => (
              <tr key={row.type} className="border-t border-rule">
                <td className="py-1.5 font-mono text-xs">{row.type}</td>
                <td className="py-1.5 text-right font-mono">{row.planted}</td>
                <td className="py-1.5 text-right font-mono">{row.reported}</td>
                <td className="py-1.5 text-right font-mono">{row.precision.toFixed(2)}</td>
                <td className="py-1.5 text-right font-mono">{row.recall.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Matched by:{' '}
        {Object.entries(card.matchesByTier)
          .map(([tier, count]) => `${TIER_LABELS[tier] ?? tier} ${count}`)
          .join(' · ')}
      </p>
    </section>
  );
}

/** One labelled figure. */
function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between border-b border-rule py-1.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
