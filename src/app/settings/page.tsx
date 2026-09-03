/**
 * Settings (docs/DESIGN.md §S-9).
 *
 * A deliberately short screen, and the shortness is the point.
 *
 * The matching thresholds are shown here and are **not editable**. That is not
 * an unfinished control: `PRD.md` §7 states that a tolerance a user cannot see
 * is a magic number they cannot trust, and the answer to that was to publish
 * the values, not to let each user retune them. A per-user threshold would also
 * make two people's runs on the same file incomparable, and every run already
 * snapshots the parameters it used into `recon_runs.params` so an old result
 * stays explicable regardless.
 *
 * What is genuinely a preference — the theme — lives in the sidebar where it is
 * reachable from every screen, so it is not duplicated here.
 */

import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-sidebar';
import { Card, Notice, PageShell, SectionHeading } from '@/components/ui';
import { formatMinor } from '@/core/money';
import { DEFAULT_RECON_PARAMS } from '@/core/reconcile/config';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** One label-and-value line. */
function Row({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="border-b border-rule py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-sm">{label}</dt>
        <dd className="shrink-0 font-mono text-sm">{value}</dd>
      </div>
      <p className="prose-measure mt-1 text-xs leading-relaxed text-ink-muted">{detail}</p>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (user === null) redirect('/signin?next=%2Fsettings');

  const client = await createClient();
  const { count } = await client
    .from('datasets')
    .select('id', { count: 'exact', head: true });

  const params = DEFAULT_RECON_PARAMS;

  return (
    <AppShell email={user.email}>
      <PageShell>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>

        <section className="mt-8">
          <SectionHeading>Account</SectionHeading>
          <Card className="mt-3 px-5 py-1">
            <dl>
              <Row
                label="Signed in as"
                value={user.email ?? '—'}
                detail="Every query runs as this user. Row-level security scopes the data, not the interface — another account sees none of these rows."
              />
              <Row
                label="Datasets"
                value={String(count ?? 0)}
                detail="Owned by this account."
              />
            </dl>
          </Card>
        </section>

        <section className="mt-10">
          <SectionHeading>Matching thresholds</SectionHeading>
          <Notice tone="neutral" className="mt-3">
            These are read-only, deliberately. Published so a result can be interrogated; fixed so
            that two runs of the same file are comparable. Each run also stores the values it used,
            so an old result stays explicable after a default changes.
          </Notice>
          <Card className="mt-3 px-5 py-1">
            <dl>
              <Row
                label="Date window"
                value={`± ${params.dateWindowDays} days`}
                detail="Payouts commonly settle a day or two after the sale; beyond that the gap is worth reporting."
              />
              <Row
                label="Amount tolerance"
                value={`± ${(params.amountToleranceBps / 100).toFixed(2)}%`}
                detail="Absorbs rounding and minor fee drift without hiding a real shortfall."
              />
              <Row
                label="Tolerance floor"
                value={formatMinor(params.amountToleranceFloorMinor)}
                detail="A floor so small amounts still get workable slack from a percentage that would otherwise round to nothing."
              />
              <Row
                label="Reference similarity"
                value={`≥ ${params.refSimilarityThreshold}`}
                detail="Roughly one character in eight. Set high because a loose reference match is the likeliest route to a false match, and a false match is the error this tool must not make."
              />
              <Row
                label="Combined payments"
                value={`≤ ${params.maxPartialSetSize} records`}
                detail="A payment split four or more ways is missed rather than searched for: subset-sum cost grows sharply with set size, and a miss is a cheaper error than a wrong pairing."
              />
            </dl>
          </Card>
        </section>
        <section className="mt-10">
          <SectionHeading>Data and retention</SectionHeading>
          <p className="prose-measure mt-3 text-sm leading-relaxed text-ink-muted">
            Stated plainly because this is a finance tool and the question is reasonable. Nothing
            below is aspirational — it describes what the code does today.
          </p>
          <Card className="mt-3 px-5 py-1">
            <dl>
              <Row
                label="What is stored"
                value="Files, records, results"
                detail="The statement or CSV you upload, the records parsed or extracted from it, and the output of each reconciliation run."
              />
              <Row
                label="Who can read it"
                value="Only this account"
                detail="Row-level security scopes every table and every storage object to the owning user. There is deliberately no service-role key anywhere in this project — not in the repository, not in the deployment — because that key bypasses RLS entirely."
              />
              <Row
                label="Deleting a dataset"
                value="Immediate, irreversible"
                detail="Removes the uploaded files from storage first, then the dataset row; every record, run, match and exception is removed with it by cascade. No copy is kept."
              />
              <Row
                label="Automatic expiry"
                value="None"
                detail="An honest limitation rather than a feature: nothing is deleted on a schedule, so a document stays until you delete its dataset. A retention window is the obvious next step and is not built."
              />
              <Row
                label="Sent to the model"
                value="Documents, at extraction"
                detail="Only when you upload a PDF or image for extraction, and only the file itself. Reconciliation runs entirely on this server with no model involved, and the Q&A agent sees only results that have already been computed."
              />
            </dl>
          </Card>
        </section>
      </PageShell>
    </AppShell>
  );
}
