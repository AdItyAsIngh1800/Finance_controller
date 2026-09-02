/**
 * Root route — public overview (docs/DESIGN.md §7.1).
 *
 * Signed-in users still go straight to their datasets; only the signed-out
 * branch changed. Previously it redirected to `/signin`, on the reasoning that
 * a working tool should show the product or the door to it and nothing else.
 * That held while the only visitor was a user. It stopped holding once the
 * first visitor became a reviewer, who arrives at the production URL with no
 * account and no reason to make one, and whose question is not "how do I get
 * in" but "what is this and why should I believe it".
 *
 * So this page carries exactly one argument — where the AI is and where it is
 * deliberately absent — and two ways out: the accuracy report, which needs no
 * account, and sign-in. `PRD.md` §5 SC-3 requires that judgment be visible in
 * the product rather than only in the documents, and a login form makes it
 * visible to nobody.
 *
 * @see docs/ARCHITECTURE.md §1 — the trust boundaries this page states
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonClasses, Card, Mark, PageShell, SectionHeading } from '@/components/ui';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * One stage of the pipeline.
 *
 * @param props.step - Position in the sequence. Rendered because this genuinely
 *   is a sequence — the output of each stage is the input of the next — not as
 *   decoration.
 * @param props.name - The stage's name.
 * @param props.trust - Whether the stage uses a model, stated in full rather
 *   than abbreviated to a tick or a colour. This line is the page's argument.
 * @param props.inverted - Renders the row on the ink plane. Reserved for stage
 *   two: the absence of a model in the matching engine is the claim the rest of
 *   the page exists to set up, so it is the one place given visual weight.
 */
function Stage({
  step,
  name,
  trust,
  inverted = false,
  children,
}: {
  readonly step: number;
  readonly name: string;
  readonly trust: string;
  readonly inverted?: boolean;
  readonly children: ReactNode;
}) {
  return (
    // Two columns from `sm` up: the stage's identity on the left, its prose on
    // the right. A single flowing column would either run the text to a poor
    // measure or, capped at `prose-measure`, leave the card's right third empty
    // with the trust line stranded across the gap from the name it qualifies.
    <div
      className={`grid gap-x-6 gap-y-1 p-5 sm:grid-cols-[13rem_1fr] sm:p-6 ${
        inverted ? 'bg-ink text-paper' : ''
      }`}
    >
      <div>
        <h3 className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
          {/*
            `--ink-muted`, not `--ink-faint`.

            A step number is a digit a sighted reader actually reads, so it is
            readable text and takes the readable colour — §7.2 reserves
            `--ink-faint` for decorative marks (arrows, separators), and it sits
            deliberately below the 4.5:1 floor. Kept `aria-hidden` because the
            sequence is already carried by DOM order, so announcing "1 Extract"
            would only add noise.
          */}
          <span
            aria-hidden="true"
            className={`font-mono text-xs font-normal ${
              inverted ? 'text-paper/80' : 'text-ink-muted'
            }`}
          >
            {step}
          </span>
          {name}
        </h3>
        <p className={`mt-1 text-xs font-medium ${inverted ? 'text-paper/80' : 'text-ink-muted'}`}>
          {trust}
        </p>
      </div>
      <p
        className={`mt-2 text-sm leading-relaxed sm:mt-0 ${
          inverted ? 'text-paper/80' : 'text-ink-muted'
        }`}
      >
        {children}
      </p>
    </div>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user !== null) {
    redirect('/datasets');
  }

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Mark size="md" />
          <span className="text-sm font-semibold tracking-tight">AI Finance Controller</span>
        </div>
        <ThemeToggle />
      </div>

      <h1 className="mt-8 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
        Every discrepancy, and why.
      </h1>
      <p className="prose-measure mt-4 text-sm leading-relaxed text-ink-muted">
        Point it at a processor settlement or a bank statement alongside your own ledger. It pairs
        the records that correspond, and for everything left over it names the reason — a fee that
        came in higher than agreed, a refund the ledger never recorded, a payout that arrived two
        days after the sale.
      </p>

      <section className="mt-12">
        <SectionHeading>Where the AI is, and where it is not</SectionHeading>
        <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
          Three stages, and they are not trusted equally. The middle one decides what matches what,
          which is the answer everything else is built on, so it is the one stage with no model in
          it at all.
        </p>

        {/* `divide-y` rather than a border per row: the rule belongs *between*
            stages, and drawing it on the rows themselves puts one against the
            card's own border at the top and bottom. */}
        <Card className="mt-5 divide-y divide-rule overflow-hidden">
          <Stage step={1} name="Extract" trust="AI — Gemini, confidence-gated">
            Statements arrive as PDFs and photographs. A multimodal model reads them into
            structured records and scores its own confidence field by field. Anything below 0.85
            is held back for a person to confirm; it never enters the ledger unreviewed.
          </Stage>
          <Stage step={2} name="Reconcile" trust="No AI, deliberately" inverted>
            Matching is ordinary code. Four tiers run strongest-evidence-first, and a pair is
            accepted only when each record is the other&rsquo;s sole candidate — contested groups
            become an exception rather than a guess. The same input produces byte-identical output
            every time. There is no model here to have an off day, and no scoring to tune until
            the numbers look good.
          </Stage>
          <Stage step={3} name="Explain" trust="AI — grounded, read-only">
            Ask why something did not match and a model answers, but it may only call read-only
            lookups and quote what they return. It never computes a figure of its own, every
            answer shows the calls behind it, and asked something the data cannot support it
            declines instead of obliging.
          </Stage>
        </Card>
      </section>

      <section className="mt-12">
        <SectionHeading>The claim, and the evidence for it</SectionHeading>
        <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
          The data generator plants discrepancies on purpose and records exactly what it planted,
          so the engine is scored against a known answer rather than eyeballed. Both domains, every
          exception type, measured — including the failures.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/evaluation" className={buttonClasses('primary')}>
            How do you know it&rsquo;s right?
          </Link>
          <Link href="/signin" className={buttonClasses('secondary')}>
            Sign in
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
