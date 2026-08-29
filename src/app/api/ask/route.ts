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
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { runId?: unknown; question?: unknown };
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
  );

  return NextResponse.json(answer);
}
