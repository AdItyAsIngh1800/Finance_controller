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
import { ThemeToggle } from '@/components/theme-toggle';
import { Card, PageShell, SectionHeading, TableScroller } from '@/components/ui';
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
    <PageShell>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          How do you know it&rsquo;s right?
        </h1>
        {/* Reachable without signing in, like the rest of this page. */}
        <ThemeToggle />
      </div>
      <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
        The data generator plants discrepancies deliberately and records exactly what it planted,
        so the engine&rsquo;s output is scored against a known answer rather than eyeballed. The
        figures below come from actually running the engine, not from a stored number &mdash; the
        generators are seeded, so the same run reproduces them exactly.
      </p>

      {/* The headline is not the match rate. A tool can score 100% by matching
          everything to anything; what it cannot fake is never mismatching. */}
      <Card className="mt-8 p-5 sm:p-7">
        <p className="eyebrow">False matches</p>
        {/* The double rule needs a run of width to read as the accounting
            convention it is; on a single-digit figure it would otherwise draw
            only under the glyph and look like a strikethrough. */}
        <p className="rule-closing w-full max-w-[10rem] pb-1 font-mono text-5xl font-medium tracking-tight sm:text-6xl">
          {totalFalseMatches}
        </p>
        <p className="prose-measure mt-4 text-sm leading-relaxed text-ink-muted">
          A record pair the ground truth says should not match, which the engine matched anyway.
          This is the metric that matters most: a false exception costs a reviewer thirty seconds,
          whereas a false match silently hides the discrepancy this tool exists to catch. The two
          errors are not symmetric, and the thresholds do not treat them as such — recall may miss
          5%, this must be zero.
        </p>
      </Card>

      {scorecards.map((card) => (
        <Scorecard key={card.domain} card={card} />
      ))}

      <section className="mt-12">
        <SectionHeading>Document extraction</SectionHeading>
        <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
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
        <p className="prose-measure mt-4 text-sm leading-relaxed">
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
        <SectionHeading>Answer grounding</SectionHeading>
        <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
          Measured {GROUNDING_RESULTS.measuredOn}. {GROUNDING_RESULTS.questionsAsked} adversarial
          questions — some the data supports, some it cannot, two phrased to bait arithmetic or a
          forecast.
        </p>
        <dl className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Figure label="Ungrounded figures" value={String(GROUNDING_RESULTS.ungroundedFigures)} />
          <Figure label="Unanswerable questions declined" value={GROUNDING_RESULTS.refusalsCorrect} />
        </dl>
        <p className="prose-measure mt-4 text-sm leading-relaxed">
          Every monetary amount quoted in an answer is checked against a transcript of what the
          lookup functions actually returned. A figure the model produced but no function supplied
          is caught however plausible it reads — which is the only way to catch a failure whose
          whole character is looking correct.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeading>What this does not establish</SectionHeading>
        <ul className="prose-measure mt-4 space-y-3">
          {KNOWN_LIMITATIONS.map((limitation) => (
            <li
              key={limitation}
              className="border-l-2 border-rule-strong pl-3 text-sm leading-relaxed"
            >
              {limitation}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 border-t border-rule pt-4 text-xs leading-relaxed text-ink-muted">
        Reproduce these figures with <span className="font-mono">npm run scorecard</span>,{' '}
        <span className="font-mono">npm run extraction:report</span>, and{' '}
        <span className="font-mono">npm run grounding:report</span>.{' '}
        {/* `/` now branches: the overview for a signed-out visitor, the dataset
            list for a signed-in one. This page is public and static, so it
            cannot know which — the label has to be true of both. */}
        <Link href="/" className="underline underline-offset-2">
          Back to AI Finance Controller
        </Link>
      </p>
    </PageShell>
  );
}

/** One domain's precision and recall table. */
function Scorecard({ card }: { readonly card: DomainScorecard }) {
  const scored = card.score.byType.filter((row) => row.planted > 0 || row.reported > 0);

  return (
    <section className="mt-12">
      <SectionHeading
        trailing={
          <span className="font-mono text-xs text-ink-muted">
            {((card.matchedCount / card.sourceCount) * 100).toFixed(1)}% matched ·{' '}
            {card.durationMs.toFixed(0)} ms
          </span>
        }
      >
        {card.domain} domain
      </SectionHeading>

      {/* A precision/recall table has five numeric columns that mean nothing
          apart from each other, so it scrolls within its card below the width
          they fit in rather than reflowing into stacked pairs. */}
      <Card className="mt-3 overflow-hidden">
        <TableScroller label={`${card.domain} domain scorecard`}>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-sunk/60 text-[11px] uppercase tracking-wider text-ink-muted">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Exception type
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Planted</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Reported</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Precision</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Recall</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((row) => (
                <tr
                  key={row.type}
                  className="border-b border-rule transition-colors duration-150 ease-ui last:border-0 hover:bg-paper-sunk/50"
                >
                  <td className="px-4 py-2 font-mono text-xs">{row.type}</td>
                  <td className="px-4 py-2 text-right font-mono">{row.planted}</td>
                  <td className="px-4 py-2 text-right font-mono">{row.reported}</td>
                  <td className="px-4 py-2 text-right font-mono">{row.precision.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono">{row.recall.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            {/*
              The one figure the methodology turns on — planted against
              reported — currently costs the reader seven additions to check.
              Under the single rule that bookkeeping uses for a subtotal, as
              against the double rule under the closing figure above.

              Precision and recall are deliberately blank rather than summed or
              averaged: they are ratios, and aggregating them means choosing
              between micro- and macro-averaging, which is a methodology
              decision belonging to docs/EVALUATION.md rather than to a table
              footer. `minRecall` and `minPrecision` on the score are the
              worst-case figures, not aggregates.
            */}
            <tfoot>
              <tr className="rule-subtotal font-medium">
                <td className="px-4 py-2 text-xs">Total</td>
                <td className="px-4 py-2 text-right font-mono">
                  {scored.reduce((sum, row) => sum + row.planted, 0)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {scored.reduce((sum, row) => sum + row.reported, 0)}
                </td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </TableScroller>
      </Card>

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
