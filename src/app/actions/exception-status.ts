'use server';

/**
 * Persists a reviewer's status change on one exception.
 *
 * A Server Action rather than a route handler: this is a form-shaped mutation
 * on one row from one screen, and a route would mean hand-writing the fetch,
 * the JSON envelope and the error contract that the action gets for free.
 *
 * Security note: this does **not** re-check ownership in application code, and
 * that is deliberate. The query runs as the signed-in user through the same
 * client every other query uses, so `exceptions_owner_all` — `for all` with
 * both `using` and `with check` — scopes it at the database. An id belonging to
 * another user matches zero rows and updates nothing. Re-implementing the check
 * here would add a second, weaker authority that could drift from the policy.
 *
 * @see docs/DATA_MODEL.md §6 — RLS is the control, not the caller
 * @module
 */

import { revalidatePath } from 'next/cache';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** The three workflow states, mirroring the `exception_status` Postgres enum. */
const STATUSES = ['flagged', 'reviewing', 'resolved'] as const;

/** Where a finding sits in a reviewer's workflow. */
export type ExceptionStatus = (typeof STATUSES)[number];

/** What the caller gets back: success, or a sentence to show the user. */
export type StatusResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Moves one exception to a new workflow state.
 *
 * @param exceptionId - The finding to update.
 * @param status - The state to move it to. Validated against the enum rather
 *   than trusted: this argument crosses the network from a client component, so
 *   it is untrusted input even though the only caller in this repo is a fixed
 *   three-item cycle.
 * @returns Success, or a message describing what failed.
 */
export async function setExceptionStatus(
  exceptionId: string,
  status: ExceptionStatus,
): Promise<StatusResult> {
  if (!STATUSES.includes(status)) {
    return { ok: false, error: 'That is not a valid status.' };
  }

  // `getUser()` revalidates with the auth server; a cookie alone is not proof.
  const user = await getCurrentUser();
  if (user === null) {
    return { ok: false, error: 'Your session has expired. Sign in again to save this change.' };
  }

  const client = await createClient();
  // `select()` after the update returns the rows that were actually written,
  // which is how RLS filtering is detected: a policy match failure updates
  // nothing and errors nothing.
  const { data, error } = await client
    .from('exceptions')
    .update({ status })
    .eq('id', exceptionId)
    .select('id');

  if (error !== null) {
    return { ok: false, error: `Could not save that change: ${error.message}` };
  }
  // Zero rows means RLS filtered it out — the id is not this user's. Reported
  // as not-found rather than as a permission error, which would confirm the
  // row exists to someone probing for it.
  if ((data ?? []).length === 0) {
    return { ok: false, error: 'That exception could not be found.' };
  }

  // The run page reads status on the server, so a reload must not show a stale
  // value. The layout-level revalidate covers the run page and the cross-run
  // queue, both of which display it.
  revalidatePath('/', 'layout');
  return { ok: true };
}
