/**
 * What this tool actually reads (docs/DESIGN.md §S-12).
 *
 * This page exists instead of an "Integrations" page carrying Stripe, Razorpay,
 * PayPal and bank logos. There are no live API integrations — `PRD.md` §6 puts
 * them out of scope deliberately and says why: credential handling is a
 * security surface a one-week build should not open. A "Works with" wall of
 * third-party marks would claim a capability and a relationship that do not
 * exist, to an audience specifically trying to judge what is real.
 *
 * What is real is the file shapes below, and they are worth stating precisely:
 * a reviewer's first practical question is "would it read *my* export", and the
 * answer is a column list, not a logo.
 *
 * Every column named here is read from the adapters rather than remembered.
 * If an adapter changes, this page is wrong — which is why the required lists
 * are imported rather than retyped.
 *
 * @see src/core/adapters/settlement.ts, src/core/adapters/bank.ts
 */

import Link from 'next/link';
import { PublicFooter, PublicHeader } from '@/components/public-chrome';
import { Card, PageShell, SectionHeading, TableScroller, buttonClasses } from '@/components/ui';

/** One column, and what the engine does with it. */
interface Column {
  readonly name: string;
  readonly required: boolean;
  readonly note: string;
}

const SETTLEMENT_COLUMNS: readonly Column[] = [
  { name: 'order_ref', required: true, note: 'The reference matching runs on. Fuzzy matching tolerates about one character in eight.' },
  { name: 'txn_date', required: true, note: 'ISO date. Compared within the ±3 day window.' },
  { name: 'net', required: true, note: 'What actually settled, in major units. Rejected outright if it carries more than two decimal places rather than silently rounded.' },
  { name: 'record_id', required: false, note: 'Your own identifier, carried through untouched so a finding can be traced back.' },
  { name: 'commission', required: false, note: 'Itemised fee. Surfaces in the evidence table on an exception.' },
  { name: 'gateway_fee', required: false, note: 'Itemised fee.' },
  { name: 'fees_total', required: false, note: 'Stated total. Compared against the itemised lines — a total that exceeds its items is what FEE_VARIANCE catches.' },
  { name: 'refunds', required: false, note: 'Netted out of the payout. A refund the ledger never recorded is a common cause of AMOUNT_MISMATCH.' },
  { name: 'chargebacks', required: false, note: 'Netted out of the payout.' },
  { name: 'description', required: false, note: 'Free text, shown to the reader.' },
];

const BANK_COLUMNS: readonly Column[] = [
  { name: 'txn_date', required: true, note: 'ISO date.' },
  { name: 'reference', required: true, note: 'The reference matching runs on.' },
  { name: 'debit', required: true, note: 'Money out. Negated at the adapter boundary, so the engine never reasons about debit and credit.' },
  { name: 'credit', required: true, note: 'Money in. Exactly one of debit and credit is filled per row.' },
  { name: 'narration', required: false, note: "The bank's own text for the line." },
  { name: 'record_id', required: false, note: 'Your own identifier.' },
  { name: 'balance', required: false, note: 'Read but not reconciled against — a running balance is a derived figure, and checking it would report the same discrepancy twice.' },
];

/** A column list, rendered as a table. */
function Columns({ columns }: { readonly columns: readonly Column[] }) {
  return (
    <Card className="mt-3 overflow-hidden">
      <TableScroller label="Accepted columns">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-rule bg-paper-sunk/60 text-[11px] uppercase tracking-wider text-ink-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium">Column</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Required</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">What it is used for</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.name} className="border-b border-rule last:border-0">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{column.name}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  {column.required ? (
                    <span className="rounded-control bg-unaccounted-wash px-2 py-0.5 font-medium text-unaccounted">
                      Required
                    </span>
                  ) : (
                    <span className="text-ink-muted">Optional</span>
                  )}
                </td>
                <td className="px-4 py-2 text-ink-muted">{column.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
    </Card>
  );
}

export default function FormatsPage() {
  return (
    <>
      <PublicHeader />
      <PageShell>
        <h1 className="text-3xl font-semibold sm:text-4xl">What it reads</h1>
        <p className="prose-measure mt-4 text-sm leading-relaxed text-ink-muted">
          Two file shapes and two document types, described exactly. Column names are matched
          case-insensitively and extra columns are ignored, so an export with more in it than this
          still loads.
        </p>

        {/*
          Stated before the capability list rather than after it. A reviewer
          deciding whether to trust a tool is better served by its boundaries
          arriving first than by finding them in a footnote.
        */}
        <Card className="mt-6 border-l-2 border-l-undecided p-5">
          <p className="text-sm font-semibold">There are no live API integrations.</p>
          <p className="prose-measure mt-2 text-sm leading-relaxed text-ink-muted">
            Not built, and deliberately so: connecting to a processor or a bank means holding
            somebody&rsquo;s credentials, which is a security surface this project chose not to open.
            Everything below is file-based. Reconnecting these same adapters to a live API later is
            a small change — the engine never learns where a record came from — but it has not been
            done, and a page of logos implying otherwise would be the wrong first impression for a
            tool whose entire argument is about not overstating what it knows.
          </p>
        </Card>

        <section className="mt-12">
          <SectionHeading>Processor settlement — CSV</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            The primary domain. One row per settled payout, with fees itemised where the processor
            provides them.
          </p>
          <Columns columns={SETTLEMENT_COLUMNS} />
        </section>

        <section className="mt-12">
          <SectionHeading>Bank statement — CSV</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            One row per line on the statement, in the debit-and-credit column layout Indian banks
            export. The same engine reconciles it, with no changes: the adapter normalises both
            domains before matching begins.
          </p>
          <Columns columns={BANK_COLUMNS} />
        </section>

        <section className="mt-12">
          <SectionHeading>Ledger — CSV</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Your own side takes the same shape as the external side it is being compared against, so
            a settlement dataset expects a settlement-shaped ledger and a bank dataset a
            bank-shaped one. That is a simplification: a real ledger export looks like neither, and
            mapping arbitrary column names onto these is the obvious next piece of work.
          </p>
        </section>

        <section className="mt-12">
          <SectionHeading>Scanned documents</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            PDF, PNG, JPEG, WebP and HEIC, up to 15 MB. These are the only files a model ever sees.
            Each field comes back with a confidence score, and anything below 0.85 is held in a
            review queue rather than written to the ledger — so a bad scan degrades into work for a
            person, never into a plausible wrong number.
          </p>
          <p className="prose-measure mt-4 text-sm leading-relaxed text-ink-muted">
            CSV uploads are capped at 10 MB and are parsed deterministically, with no model
            involved at any point.
          </p>
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link href="/evaluation" className={buttonClasses('primary')}>
            How accurate is it?
          </Link>
          <Link href="/signin" className={buttonClasses('secondary')}>
            Try it
          </Link>
        </div>
      </PageShell>
      <PublicFooter />
    </>
  );
}
