/**
 * Dataset list and creation (docs/DESIGN.md §S-2).
 *
 * Every query on this page runs as the signed-in user, so Row-Level Security —
 * not this component — is what determines which rows come back. The list is
 * unfiltered by `user_id` on purpose: if the policy were wrong, this page would
 * show it rather than hiding it behind a redundant application-level filter.
 */

import { revalidatePath } from 'next/cache';
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

export default async function DatasetsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('datasets')
    .select('id, name, domain, currency, created_at')
    .order('created_at', { ascending: false });

  const datasets = (data ?? []) as DatasetRow[];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="flex items-baseline justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Datasets</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Signed in as {user?.email ?? 'unknown'}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <form
        action={createDataset}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="August settlements"
            className="rounded-md border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Domain</span>
          <select
            name="domain"
            defaultValue="settlement"
            className="rounded-md border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="settlement">Settlement</option>
            <option value="bank">Bank</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Create dataset
        </button>
      </form>

      {error !== null && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          Could not load datasets: {error.message}
        </p>
      )}

      {error === null && datasets.length === 0 && (
        <p className="mt-10 text-sm text-neutral-600 dark:text-neutral-400">
          No datasets yet. Create one above to upload a settlement report or bank statement
          alongside your ledger.
        </p>
      )}

      {datasets.length > 0 && (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Domain
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Currency
              </th>
              <th scope="col" className="py-2 font-medium">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((dataset) => (
              <tr key={dataset.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4">{dataset.name}</td>
                <td className="py-2 pr-4">{dataset.domain}</td>
                <td className="py-2 pr-4 font-mono tabular-nums">{dataset.currency}</td>
                <td className="py-2 font-mono tabular-nums text-neutral-600 dark:text-neutral-400">
                  {dataset.created_at.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
