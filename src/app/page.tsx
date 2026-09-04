/**
 * Root route — public overview (docs/DESIGN.md §S-0, §7.1.1).
 *
 * Signed-in users still go straight to their datasets; only the signed-out
 * branch renders this. The page carries one argument — where the AI is and
 * where it is deliberately absent — supported by measured figures, and offers
 * two ways on: the accuracy report and sign-in.
 *
 * Every figure in the stats strip is computed here by actually running the
 * engine, not stored as copy. The generators are seeded and the engine is
 * deterministic, so the numbers on this page and on `/evaluation` cannot
 * disagree — a marketing figure that has drifted from the measured one is
 * exactly the failure this project exists to argue against.
 *
 * @see docs/ARCHITECTURE.md §1 — the trust boundaries this page states
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { MatchAnimation } from '@/components/match-animation';
import { PublicFooter, PublicHeader } from '@/components/public-chrome';
import { buttonClasses, Card, PageShell, SectionHeading } from '@/components/ui';
import { EXCEPTION_TYPES } from '@/core/taxonomy';
import { computeScorecards } from '@/lib/evaluation';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * One stage of the pipeline.
 *
 * @param props.name - The stage's name.
 * @param props.trust - Whether the stage uses a model, stated in full rather
 *   than abbreviated to a tick or a colour. This line is the page's argument.
 * @param props.icon - A mark for the stage. Decorative and `aria-hidden`: the
 *   name beside it already says what the stage is, and an icon that repeats the
 *   label only adds noise to a screen reader.
 * @param props.emphasis - Renders the card on the ink plane. Reserved for stage
 *   two: the absence of a model in the matching engine is the claim the rest of
 *   the page exists to set up, so it is the one place given visual weight.
 */
function Stage({
  name,
  trust,
  icon,
  emphasis = false,
  children,
}: {
  readonly name: string;
  readonly trust: string;
  readonly icon: ReactNode;
  readonly emphasis?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-card border p-5 ${
        emphasis
          ? 'border-ink bg-ink text-paper shadow-lift-md'
          : 'border-rule bg-paper-raised shadow-lift-sm'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 items-center justify-center rounded-control ${
          emphasis ? 'bg-paper/15 text-paper' : 'bg-paper-sunk text-ink-muted'
        }`}
      >
        {icon}
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{name}</h3>
      <p className={`mt-1 text-xs font-medium ${emphasis ? 'text-paper/80' : 'text-ink-muted'}`}>
        {trust}
      </p>
      <p
        className={`mt-3 text-sm leading-relaxed ${emphasis ? 'text-paper/80' : 'text-ink-muted'}`}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * One figure in the stats strip.
 *
 * The label sits *under* the number, and carries the qualification rather than
 * the headline. "Match rate" is not an accuracy score and must not be read as
 * one, so the label says what it actually counts.
 */
function Stat({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <div className="px-1">
      {/* Antique Gold, reserved for figures that matter — the palette's one
          "use sparingly" colour, spent here and on the match rate. */}
      <p className="text-2xl font-semibold tracking-tight text-accent-strong sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs leading-snug text-ink-muted">{label}</p>
    </div>
  );
}

/* Stage marks. Drawn inline so they inherit `currentColor` and cost no request. */

/** A document: what stage one reads. */
const ExtractIcon = (
  <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11.5 2.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.5z" strokeLinejoin="round" />
    <path d="M11.5 2.5v4h4M7.5 10.5h5M7.5 13.5h3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Two halves meeting: what stage two decides. */
const ReconcileIcon = (
  <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 6.5h4.5a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2H17" strokeLinecap="round" />
    <path d="M3 13.5h4.5a2 2 0 0 0 2-2v-3a2 2 0 0 1 2-2H17" strokeLinecap="round" />
    <path d="M14.5 4.5 17 6.5l-2.5 2M14.5 11.5 17 13.5l-2.5 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A conversation: what stage three answers. */
const ExplainIcon = (
  <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path
      d="M17 11.5a2 2 0 0 1-2 2h-5l-4 3v-3H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
      strokeLinejoin="round"
    />
    <path d="M7 7.5h6M7 10h4" strokeLinecap="round" />
  </svg>
);

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user !== null) {
    redirect('/datasets');
  }

  const scorecards = computeScorecards();
  const falseMatches = scorecards.reduce(
    (count, card) => count + card.score.falseMatches.length,
    0,
  );
  // Both domains score identically, so the strip quotes the settlement figure
  // and names the domain count separately rather than averaging two equal
  // numbers and implying a spread that does not exist.
  const settlement = scorecards[0];
  const matchRate =
    settlement === undefined
      ? '—'
      : `${((settlement.matchedCount / settlement.sourceCount) * 100).toFixed(1)}%`;

  return (
    <>
      <PublicHeader />
      <PageShell>
        {/*
          The headline is the motto, and it is the largest thing on the page.
          What used to sit beneath it was a paragraph explaining the product to a
          stranger — accurate, but it introduced rather than declared, and a
          visitor had to read four lines before learning anything they could not
          have guessed. The explaining now happens further down, after the
          figures have earned it.
        */}
        <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Every discrepancy,
          <br />
          and why.
        </h1>
        <p className="prose-measure mt-6 text-base leading-relaxed sm:text-lg">
          Reconciliation you can audit line by line — with{' '}
          <span className="text-accent-strong">no model anywhere near the matching</span>.
        </p>

        <MatchAnimation />

        {/*
          Figures before argument. A reviewer who reads nothing else should still
          leave with the one number that cannot be faked.
        */}
        <Card className="mt-10 grid grid-cols-2 gap-y-6 p-5 sm:grid-cols-4 sm:p-6">
          <Stat value={String(falseMatches)} label="False matches, both domains" />
          <Stat value={matchRate} label="Source records matched" />
          <Stat value={String(EXCEPTION_TYPES.length)} label="Exception types detected" />
          <Stat value={String(scorecards.length)} label="Domains, one shared engine" />
        </Card>
        <p className="prose-measure mt-3 text-xs leading-relaxed text-ink-muted">
          Measured, not asserted: these come from running the engine against data whose
          discrepancies were planted on purpose.{' '}
          <Link href="/evaluation" className="text-accent underline underline-offset-2">
            See the full scorecard
          </Link>
          . Match rate is a coverage figure, not a correctness one — the figure that matters is the
          zero beside it.
        </p>

        <section id="how-it-works" className="mt-14 scroll-mt-20">
          <SectionHeading>Where the AI is, and where it is not</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Point it at a processor settlement or a bank statement alongside your own ledger. It
            pairs the records that correspond, and for everything left over it names the reason — a
            fee that came in higher than agreed, a refund the ledger never recorded, a payout that
            arrived two days after the sale.
          </p>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Three stages do that work, and they are not trusted equally. The middle one decides what
            matches what, which is the answer everything else is built on, so it is the one stage
            with no model in it at all.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Stage name="Extract" trust="AI — Gemini, confidence-gated" icon={ExtractIcon}>
              Statements arrive as PDFs and photographs. A multimodal model reads them into
              structured records and scores its own confidence field by field. Anything below 0.85
              is held back for a person to confirm; it never enters the ledger unreviewed.
            </Stage>
            <Stage name="Reconcile" trust="No AI, deliberately" icon={ReconcileIcon} emphasis>
              Matching is ordinary code. Four tiers run strongest-evidence-first, and a pair is
              accepted only when each record is the other&rsquo;s sole candidate — contested groups
              become an exception rather than a guess. The same input produces byte-identical
              output every time.
            </Stage>
            <Stage name="Explain" trust="AI — grounded, read-only" icon={ExplainIcon}>
              Ask why something did not match and a model answers, but it may only call read-only
              lookups and quote what they return. It never computes a figure of its own, and every
              answer shows the calls behind it.
            </Stage>
          </div>
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link href="/evaluation" className={buttonClasses('primary')}>
            How do you know it&rsquo;s right?
          </Link>
          <Link href="/signin" className={buttonClasses('secondary')}>
            Sign in
          </Link>
        </div>
      </PageShell>
      <PublicFooter />
    </>
  );
}
