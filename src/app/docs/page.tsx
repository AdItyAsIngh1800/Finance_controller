/**
 * How matching works (docs/DESIGN.md §S-13).
 *
 * The reconciliation engine is the project's central claim — the one stage with
 * no model in it — and until now the only full explanation of *how* it decides
 * lived in `docs/ARCHITECTURE.md` §4, a file no reviewer opens. The landing
 * page states that Stage 2 has no AI; this page says what it does instead.
 *
 * The taxonomy table is generated from `src/core/taxonomy.ts` rather than
 * retyped. That vocabulary is frozen and shared verbatim by the engine, the
 * Postgres enum, the queue and the agent, so a page that restated it by hand
 * would be a fifth copy free to drift from the other four.
 *
 * @see docs/ARCHITECTURE.md §4, docs/DATA_MODEL.md §3.4
 */

import Link from 'next/link';
import { PublicFooter, PublicHeader } from '@/components/public-chrome';
import { Card, PageShell, SectionHeading, TableScroller, buttonClasses } from '@/components/ui';
import {
  EXCEPTION_DISPOSITION,
  EXCEPTION_SEVERITY,
  EXCEPTION_TYPES,
  SEVERITY_RANK,
} from '@/core/taxonomy';

/** One rung of the matching ladder. */
interface Tier {
  readonly name: string;
  readonly rule: string;
  readonly note: string;
}

const TIERS: readonly Tier[] = [
  {
    name: 'Exact reference',
    rule: 'normalised reference equal AND amount equal',
    note: 'The strongest evidence there is. Two records agreeing on both identity and figure are the same transaction.',
  },
  {
    name: 'Amount and date',
    rule: 'amount equal, dates within the window',
    note: 'For records whose references disagree — a processor that rewrites them, or a ledger that never captured one.',
  },
  {
    name: 'Similar reference',
    rule: 'similarity ≥ threshold, amount within tolerance',
    note: 'Absorbs a transposed digit or a dropped prefix. Set deliberately high: a loose reference match is the likeliest route to a wrong pairing.',
  },
  {
    name: 'Combined payments',
    rule: 'bounded subset-sum, at most three records',
    note: 'One payout settling several sales. Bounded on purpose — a payment split four or more ways is missed rather than searched for, because a miss is a cheaper error than a wrong pairing.',
  },
];

/** Severity label and its colour, matching the queue. */
const SEVERITY_STYLE: Readonly<Record<string, string>> = {
  high: 'bg-unaccounted-wash text-unaccounted',
  medium: 'bg-undecided-wash text-undecided',
  low: 'bg-explained-wash text-explained',
};

export default function DocsPage() {
  // Sorted by severity so the table reads worst-first, like the queue does.
  const types = [...EXCEPTION_TYPES].sort(
    (a, b) => SEVERITY_RANK[EXCEPTION_SEVERITY[a]] - SEVERITY_RANK[EXCEPTION_SEVERITY[b]],
  );

  return (
    <>
      <PublicHeader />
      <PageShell>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How matching works</h1>
        <p className="prose-measure mt-4 text-sm leading-relaxed text-ink-muted">
          The stage with no model in it. Everything below is ordinary code with exact answers, which
          is the entire reason it is not a model: comparing amounts and dates has a right answer,
          and a model here would trade determinism and auditability for nothing.
        </p>

        <section className="mt-12">
          <SectionHeading>Four tiers, strongest evidence first</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Each tier sees only what the previous tiers left unmatched, and every match records the
            tier that claimed it — which is what lets the assistant explain how two records were
            paired. Because the order runs strongest-first, a confident match can never be displaced
            by a speculative one.
          </p>

          <ol className="mt-5">
            {TIERS.map((tier, index) => (
              <li key={tier.name} className="border-b border-rule py-4 last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span aria-hidden="true" className="font-mono text-xs text-ink-muted">
                    {index + 1}
                  </span>
                  <h3 className="text-base font-semibold tracking-tight">{tier.name}</h3>
                  <span className="font-mono text-xs text-ink-muted">{tier.rule}</span>
                </div>
                <p className="prose-measure mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {tier.note}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <SectionHeading>A pairing needs to be mutual</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Within a tier, two records are paired only when each is the other&rsquo;s <em>sole</em>{' '}
            candidate. If three records could plausibly match one, none of them is chosen — the
            group becomes a <span className="font-mono text-xs">DUPLICATE_SUSPECTED</span> exception
            for a person to resolve.
          </p>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            There is no tie-breaking anywhere in the engine. That is what makes it deterministic —
            identical input produces byte-identical output — and it is also why false matches are
            zero rather than merely low. Guessing between two candidates would be right about half
            the time, and being right half the time is indistinguishable from being wrong when
            nobody checks.
          </p>
        </section>

        <section className="mt-12">
          <SectionHeading>What happens to the residue</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            After the four tiers, before anything is declared unmatched, the leftovers are examined
            once more for records whose references agree but whose amounts do not. Those become one{' '}
            <span className="font-mono text-xs">AMOUNT_MISMATCH</span> naming both figures, rather
            than two unrelated orphans.
          </p>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            The distinction matters to whoever has to act. &ldquo;These two are the same payout and
            differ by ₹412&rdquo; is a question you can answer. &ldquo;Here are two records we know
            nothing about&rdquo; is not.
          </p>
        </section>

        <section className="mt-12">
          <SectionHeading>A false match is not a false exception</SectionHeading>
          <Card className="mt-3 border-l-2 border-l-unaccounted p-5">
            <p className="prose-measure text-sm leading-relaxed">
              A false <strong>exception</strong> costs a reviewer thirty seconds. A false{' '}
              <strong>match</strong> silently conceals the discrepancy this tool exists to catch,
              and nobody ever looks at it again.
            </p>
            <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
              The two errors are not symmetric, so the thresholds do not treat them as such. Where a
              bound could reasonably go either way it is set to the stricter option. The engine is
              allowed to miss about 5% of matches; it is allowed zero false ones.
            </p>
          </Card>
        </section>

        <section className="mt-12">
          <SectionHeading>The eight things it can report</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            A closed vocabulary, frozen before the engine was written and shared verbatim by the
            engine, the database, the queue and the assistant. <strong>Severity</strong> is whether
            money is unaccounted for. <strong>Disposition</strong> is whether the records still
            paired up: a blocking exception leaves them unmatched, an advisory one annotates a match
            that was made anyway — a payout that arrived two days late is reconciled <em>and</em>{' '}
            flagged.
          </p>
          <Card className="mt-4 overflow-hidden">
            <TableScroller label="Exception types, with severity and disposition">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper-sunk/60 text-[11px] uppercase tracking-wider text-ink-muted">
                    <th scope="col" className="px-4 py-2 text-left font-medium">Exception</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Severity</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Disposition</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((type) => {
                    const severity = EXCEPTION_SEVERITY[type];
                    return (
                      <tr key={type} className="border-b border-rule last:border-0">
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{type}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`whitespace-nowrap rounded-control px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[severity] ?? ''}`}
                          >
                            {severity}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-ink-muted">
                          {EXCEPTION_DISPOSITION[type] === 'blocking'
                            ? 'Blocking — the records stay unmatched'
                            : 'Advisory — annotates a match that was still made'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroller>
          </Card>
        </section>

        <section className="mt-12">
          <SectionHeading>Money is never a floating-point number</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Every amount is an integer count of paise, carried as a distinct type that a plain
            number cannot be assigned to without an explicit conversion. Parsing rejects anything
            with more than two decimal places rather than rounding it, because a silent rounding
            creates a discrepancy the engine later reports with no way to trace it back to the
            moment it was invented.
          </p>
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link href="/evaluation" className={buttonClasses('primary')}>
            How accurate is it?
          </Link>
          <Link href="/formats" className={buttonClasses('secondary')}>
            What it reads
          </Link>
        </div>
      </PageShell>
      <PublicFooter />
    </>
  );
}
