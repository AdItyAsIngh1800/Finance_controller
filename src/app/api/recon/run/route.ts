/**
 * Reconciliation endpoint.
 *
 * Loads both sides of a dataset, runs the deterministic engine, and persists the
 * run. No model is involved at any point — see docs/ARCHITECTURE.md §1.
 *
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { runReconciliation } from '@/lib/pipeline';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let datasetId: string;
  try {
    const body: unknown = await request.json();
    datasetId = String((body as { datasetId?: unknown }).datasetId ?? '');
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (datasetId.length === 0) {
    return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 });
  }

  const client = await createClient();
  const { data: dataset, error } = await client
    .from('datasets')
    .select('id, domain')
    .eq('id', datasetId)
    .maybeSingle();

  if (error !== null) return NextResponse.json({ error: error.message }, { status: 500 });
  if (dataset === null) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });

  try {
    const { runId, result } = await runReconciliation(client, {
      datasetId,
      userId: user.id,
      domain: (dataset as { domain: 'settlement' | 'bank' }).domain,
    });
    return NextResponse.json({ runId, stats: { ...result.stats, matchesByTier: result.stats.matchesByTier } });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Reconciliation failed.' },
      { status: 500 },
    );
  }
}
