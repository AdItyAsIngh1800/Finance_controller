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
import { PublicFooter, PublicHeader } from '@/components/public-chrome';
import { buttonClasses, Card, PageShell, SectionHeading } from '@/components/ui';
import { EXCEPTION_TYPES } from '@/core/taxonomy';
import { computeScorecards, type Finding } from '@/lib/evaluation';
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
    <Card plane={emphasis ? 'ink' : 'raised'} className="flex h-full flex-col p-5">
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 items-center justify-center rounded-control ${
          emphasis ? 'bg-paper/15 text-paper' : 'bg-paper-sunk text-ink-muted'
        }`}
      >
        {icon}
      </span>
      {/* `.display` is the opt-in serif. Bumped a step because Cormorant
          renders optically smaller than Inter at the same pixel size, and
          `tracking-tight` is dropped for the reason the heading rule explains. */}
      <h3 className="display mt-4 text-lg">{name}</h3>
      <p className={`mt-1 text-xs font-medium ${emphasis ? 'text-paper/80' : 'text-ink-muted'}`}>
        {trust}
      </p>
      <p
        className={`mt-3 text-sm leading-relaxed ${emphasis ? 'text-paper/80' : 'text-ink-muted'}`}
      >
        {children}
      </p>
    </Card>
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

/**
 * The engine's actual output, beside the headline.
 *
 * Replaces `LedgerExtract`, which was an *illustration* of a ledger page: four
 * specimen entries that nothing computed, deliberately `aria-hidden` and
 * carrying no label, so that no reader could mistake them for results.
 *
 * This panel needs none of those precautions, because every row in it is real.
 * `computeScorecards()` already runs the engine over the seeded datasets on each
 * render, and these are the highest-severity findings it returned: the record's
 * own reference, the figures that actually disagreed, and the sentence the
 * engine itself wrote. The generators are seeded and the engine is
 * deterministic, so the panel is stable between renders without being
 * hard-coded — the one property that lets a landing page show live output at
 * all.
 *
 * It is therefore labelled, and labelled precisely. The dataset is synthetic and
 * a visitor must not read these as somebody's books, so "synthetic demo data"
 * sits on the panel rather than in a footnote. That is the same rule the old
 * specimen block obeyed, pointed the other way: say exactly what the numbers are.
 *
 * Two findings from each domain, in the engine's own severity order. The rule is
 * stated because an unstated selection from a larger set is indistinguishable
 * from a flattering one.
 */
function FindingsPanel({ findings }: { readonly findings: readonly Finding[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
        <h2 className="eyebrow">Exceptions found</h2>
        <p className="text-xs text-ink-muted">Synthetic demo data, both domains</p>
      </div>
      <ul className="divide-y divide-rule">
        {findings.map((finding) => (
          <li key={`${finding.reference}-${finding.type}`} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-sm text-ink">{finding.reference}</span>
              {/* The source figure, or the ledger's when only that side exists —
                  an orphan has one amount and nothing to compare it against. */}
              <span className="font-mono text-sm text-ink">
                {finding.sourceAmount ?? finding.ledgerAmount ?? '—'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-muted">{finding.type}</span>
              {/* Only a genuine two-sided disagreement gets the comparison line.
                  Printing "vs —" against an orphan would invent a counterpart
                  the engine is reporting the absence of. */}
              {finding.sourceAmount !== null && finding.ledgerAmount !== null && (
                <span className="font-mono text-xs text-unaccounted">
                  vs {finding.ledgerAmount}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
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

  /*
   * Two findings per domain, in the engine's own severity order.
   *
   * Not simply the top four overall: settlement's highest-severity findings are
   * all orphans, so a straight slice would fill the panel with rows that have
   * one amount and no comparison, and never show the two-sided disagreement the
   * product is most recognisable for. Two-per-domain is a rule that can be
   * stated on the panel, which an unstated selection from a larger set cannot.
   * It also happens to demonstrate the "one engine, two domains" claim the
   * stats strip makes a few hundred pixels below.
   */
  const findings = scorecards.flatMap((card) => card.findings.slice(0, 2));

  return (
    <>
      <PublicHeader width="wide" />
      <PageShell width="wide">
        {/*
          The headline is the motto, and it is the largest thing on the page.
          What used to sit beneath it was a paragraph explaining the product to a
          stranger — accurate, but it introduced rather than declared, and a
          visitor had to read four lines before learning anything they could not
          have guessed. The explaining now happens further down, after the
          figures have earned it.
        */}
        {/*
          A spread, not a column.

          The headline argues and the panel beside it demonstrates, which is the
          whole reason for the two-column form: a visitor used to be able to read
          this entire page and never see the product. Asymmetric at `lg` — the
          text column is the wider of the two, because the claim leads and the
          evidence supports it — and a strict single column below that, where
          side-by-side would squeeze both halves to nothing.

          The stats stay *out* of this block deliberately. `.ledger-ground` draws
          a gradient, axe cannot resolve a contrast ratio over one, and putting
          four more figures on it would widen a "needs review" from the headline
          alone to most of the hero.
        */}
        <div className="ledger-ground relative -mx-4 mt-2 grid items-start gap-10 px-4 pb-10 pt-8 sm:-mx-6 sm:px-6 sm:pb-14 sm:pt-12 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div>
            <h1 className="text-4xl leading-[1.05] tracking-tight sm:text-6xl">
              Every discrepancy,
              <br />
              and why.
            </h1>
            <p className="prose-measure mt-6 text-base leading-relaxed sm:text-lg">
              Reconciliation you can audit line by line.{' '}
              <span className="text-accent-strong">No model anywhere near the matching.</span>
            </p>
          </div>

          <FindingsPanel findings={findings} />
        </div>

        {/*
          Figures before argument. A reviewer who reads nothing else should still
          leave with the one number that cannot be faked.

          Unboxed. A card here drew a border around four numbers that needed no
          container to be read as a group — the rule beneath them separates them
          from the argument that follows, and a panel is for elevation rather
          than for grouping things that are already adjacent.
        */}
        <div className="mt-12 grid grid-cols-2 gap-y-6 border-t border-rule-strong pt-6 sm:grid-cols-4">
          <Stat value={String(falseMatches)} label="False matches, both domains" />
          <Stat value={matchRate} label="Source records matched" />
          <Stat value={String(EXCEPTION_TYPES.length)} label="Exception types detected" />
          <Stat value={String(scorecards.length)} label="Domains, one shared engine" />
        </div>
        <p className="mt-4 text-xs text-ink-muted">
          Measured, not claimed.{' '}
          <Link href="/evaluation" className="text-accent underline underline-offset-2">
            See the scorecard
          </Link>
          .
        </p>

        <section id="how-it-works" className="mt-14 scroll-mt-20">
          <SectionHeading>Where the AI is, and where it is not</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Three stages. Only the middle one decides what matches what, and it has no model in it.
          </p>

          {/*
            Three equal cards in a row was the wrong shape for this argument.
            It gave the middle stage — the one claim the whole page exists to
            make — exactly one third of the width, the same as the two stages
            that merely qualify it.

            So the stages zig-zag, and stage two takes the full band. Reading
            order is still 1, 2, 3: the offset is horizontal, so a stage never
            appears before the stage it follows. Below `md` the offsets collapse
            and the three stack, which is the same sequence at one width.
          */}
          <div className="mt-5 space-y-4">
            <div className="md:w-[58%]">
              <Stage name="Extract" trust="AI, confidence-gated" icon={ExtractIcon}>
                A model reads PDFs and photographs into records. Anything it is unsure of goes to
                a person, never to the ledger.
              </Stage>
            </div>

            <Stage name="Reconcile" trust="No AI, deliberately" icon={ReconcileIcon} emphasis>
              Ordinary code. Same input, same output, every time. No model decides what matches
              what, so a pairing can always be traced to the rule that made it.
            </Stage>

            <div className="md:ml-auto md:w-[58%]">
              <Stage name="Explain" trust="AI, read-only" icon={ExplainIcon}>
                Answers come from lookups it must show you. It quotes figures. It never computes
                one.
              </Stage>
            </div>
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
      <PublicFooter width="wide" />
    </>
  );
}
