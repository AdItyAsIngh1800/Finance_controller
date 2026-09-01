/**
 * Dataset list and creation (docs/DESIGN.md §S-2).
 *
 * Every query on this page runs as the signed-in user, so Row-Level Security —
 * not this component — is what determines which rows come back. The list is
 * unfiltered by `user_id` on purpose: if the policy were wrong, this page would
 * show it rather than hiding it behind a redundant application-level filter.
 */

import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { AppHeader, PageHeading } from '@/components/app-header';
import { DeleteDataset } from '@/components/delete-dataset';
import { SeedDemo } from '@/components/seed-demo';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  PageShell,
  SectionHeading,
  SelectField,
} from '@/components/ui';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { isDomain } from '@/core/taxonomy';

/** A dataset row as listed on this page. */
interface DatasetRow {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly currency: string;
  readonly created_at: string;
}

/**
 * Creates a dataset owned by the signed-in user.
 *
 * `user_id` is taken from the verified session rather than the form, so a
 * crafted request cannot attribute a dataset to someone else. The RLS
 * `with check` clause enforces the same thing at the database level.
 */
async function createDataset(formData: FormData): Promise<void> {
  'use server';

  const user = await getCurrentUser();
  if (user === null) throw new Error('Not signed in.');

  const name = String(formData.get('name') ?? '').trim();
  const domain = String(formData.get('domain') ?? '');

  if (name.length === 0) throw new Error('Dataset name is required.');
  if (!isDomain(domain)) throw new Error(`Unsupported domain: ${domain}`);

  const supabase = await createClient();
  const { error } = await supabase.from('datasets').insert({ user_id: user.id, name, domain });
  if (error !== null) throw new Error(`Could not create dataset: ${error.message}`);

  revalidatePath('/datasets');
}

/**
 * Deletes a dataset and everything belonging to it.
 *
 * Records, runs, matches and exceptions are removed by the schema's cascading
 * foreign keys. Storage objects are **not** — no cascade reaches the bucket —
 * so uploaded documents are removed explicitly first. Skipping that would leave
 * files nobody can see and nobody can delete, still counting against storage.
 *
 * RLS scopes the delete to the signed-in user, so a dataset belonging to
 * someone else matches no row rather than raising.
 *
 * @see docs/REQUIREMENTS.md FR-2.4
 */
async function deleteDataset(formData: FormData): Promise<void> {
  'use server';

  const user = await getCurrentUser();
  if (user === null) throw new Error('Not signed in.');

  const datasetId = String(formData.get('datasetId') ?? '');
  if (datasetId.length === 0) throw new Error('A dataset is required.');

  const supabase = await createClient();

  // Documents live under `{userId}/{datasetId}/…`, which is also what the
  // storage policy keys on.
  const prefix = `${user.id}/${datasetId}`;
  const { data: objects } = await supabase.storage.from('documents').list(prefix);
  if (objects !== null && objects.length > 0) {
    await supabase.storage
      .from('documents')
      .remove(objects.map((object) => `${prefix}/${object.name}`));
  }

  const { error } = await supabase.from('datasets').delete().eq('id', datasetId);
  if (error !== null) throw new Error(`Could not delete the dataset: ${error.message}`);

  revalidatePath('/datasets');
}

export default async function DatasetsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('datasets')
    .select('id, name, domain, currency, created_at')
    .order('created_at', { ascending: false });

  const datasets = (data ?? []) as DatasetRow[];

  return (
    <>
      <AppHeader email={user?.email} />
      <PageShell>
        <PageHeading
          title="Datasets"
          description="Each dataset pairs one external source — a processor settlement or a bank statement — with the ledger it should agree with."
        />

        <Card className="mt-7 p-4 sm:p-5">
          <form action={createDataset} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field
              label="Name"
              name="name"
              required
              placeholder="August settlements"
              autoComplete="off"
            />
            <SelectField label="Domain" name="domain" defaultValue="settlement">
              <option value="settlement">Settlement</option>
              <option value="bank">Bank</option>
            </SelectField>
            <Button type="submit" variant="primary" className="w-full sm:w-auto">
              Create dataset
            </Button>
          </form>
        </Card>

        {error !== null && (
          <Notice tone="error" className="mt-6">
            Could not load datasets: {error.message}
          </Notice>
        )}

        {error === null && datasets.length === 0 && (
          <div className="mt-8">
            <EmptyState title="No datasets yet" action={<SeedDemo />}>
              Create one above to upload a settlement report or bank statement alongside your
              ledger — or start from prepared data with known discrepancies already planted.
            </EmptyState>
          </div>
        )}

        {datasets.length > 0 && (
          <section className="mt-10">
            <SectionHeading
              trailing={
                <span className="font-mono text-xs text-ink-muted">
                  {datasets.length} total
                </span>
              }
            >
              Your datasets
            </SectionHeading>

            {/*
              Two renderings of the same rows.

              A reconciliation table cannot usefully compress to a phone: the
              columns are already at their minimum legible width. Rather than
              scroll it sideways, below `md` each row is restated as a card,
              which keeps every field readable and the whole list scannable in
              one direction. The table markup is preserved above that width,
              where column alignment is what makes the list scannable at all.
            */}
            <ul className="mt-3 grid gap-3 md:hidden">
              {datasets.map((dataset) => (
                <li key={dataset.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/datasets/${dataset.id}`}
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {dataset.name}
                      </Link>
                      <DeleteDataset
                        datasetId={dataset.id}
                        name={dataset.name}
                        action={deleteDataset}
                      />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <Meta label="Domain">{dataset.domain}</Meta>
                      <Meta label="Currency" mono>
                        {dataset.currency}
                      </Meta>
                      <Meta label="Created" mono>
                        {dataset.created_at.slice(0, 10)}
                      </Meta>
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>

            <div className="mt-3 hidden md:block">
              <Card className="overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-rule bg-paper-sunk/60 text-left">
                      <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">
                        Name
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">
                        Domain
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">
                        Currency
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">
                        Created
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasets.map((dataset) => (
                      <tr
                        key={dataset.id}
                        className="border-b border-rule transition-colors duration-150 ease-ui last:border-0 hover:bg-paper-sunk/50"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/datasets/${dataset.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {dataset.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-ink-muted">{dataset.domain}</td>
                        <td className="px-4 py-2.5 font-mono">{dataset.currency}</td>
                        <td className="px-4 py-2.5 font-mono text-ink-muted">
                          {dataset.created_at.slice(0, 10)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <DeleteDataset
                            datasetId={dataset.id}
                            name={dataset.name}
                            action={deleteDataset}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </section>
        )}
      </PageShell>
    </>
  );
}

/**
 * One labelled value in the mobile card rendering of a dataset row.
 *
 * @param props.mono - Whether the value is a figure or code, which gets the
 *   monospace face so digits stay column-aligned between stacked cards.
 */
function Meta({
  label,
  mono = false,
  children,
}: {
  readonly label: string;
  readonly mono?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}
