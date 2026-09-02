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
      </PageShell>
    </AppShell>
  );
}
