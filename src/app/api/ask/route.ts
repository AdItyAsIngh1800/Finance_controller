/**
 * Grounded Q&A endpoint (Stage 3).
 *
 * The agent reads only what the deterministic engine produced, through a
 * read-only function surface, scoped by RLS to the signed-in user's own run.
 *
 * @see docs/REQUIREMENTS.md FR-7
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { askAboutRun } from '@/ai/agent';
import { createSupabaseDataSource } from '@/lib/recon-source';
import { consume } from '@/lib/rate-limit';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  /*
   * Budget check, immediately after authentication and before any work.
   *
   * Placed here rather than deeper in the handler so a refused call costs a map
   * lookup instead of a file read, a storage write and a model round trip.
   * `Retry-After` is set because a 429 without it tells a client to guess.
   */
  const budget = consume('ask', user.id);
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error:
          'Too many requests. This limit exists to keep one runaway loop from ' +
          'spending the project\'s model budget; wait a moment and try again.',
      },
      { status: 429, headers: { 'Retry-After': String(budget.retryAfterSeconds) } },
    );
  }

  let body: { runId?: unknown; question?: unknown; history?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const runId = String(body.runId ?? '');
  const question = String(body.question ?? '').trim();
  if (runId.length === 0) {
    return NextResponse.json({ error: 'runId is required.' }, { status: 400 });
  }
  if (question.length === 0) {
    return NextResponse.json({ error: 'A question is required.' }, { status: 400 });
  }

  // History arrives from the client, so it is treated as input rather than
  // trusted: each entry is coerced to two strings and the list is capped. It
  // only ever becomes conversational context, never a source of figures — those
  // must still come from a function result.
  const history = Array.isArray(body.history)
    ? body.history
        .slice(-12)
        .map((entry) => {
          const item = entry as { question?: unknown; answer?: unknown };
          return {
            question: String(item.question ?? '').slice(0, 2000),
            answer: String(item.answer ?? '').slice(0, 4000),
          };
        })
        .filter((entry) => entry.question.length > 0 && entry.answer.length > 0)
    : [];

  const client = await createClient();
  // RLS scopes this: a run belonging to someone else simply is not found.
  const { data: run } = await client
    .from('recon_runs')
    .select('id, dataset_id')
    .eq('id', runId)
    .maybeSingle();
  if (run === null) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  const answer = await askAboutRun(
    createSupabaseDataSource(client, runId, (run as { dataset_id: string }).dataset_id),
    question,
    history,
  );

  return NextResponse.json(answer);
}
