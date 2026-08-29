/**
 * Discards an extraction without promoting it.
 *
 * The counterpart to confirming. A document the model could not read usefully —
 * or one uploaded by mistake — has to be dismissable, or the review queue
 * accumulates items that block reconciliation forever and cannot be cleared.
 *
 * Rejection writes no record. The extraction and its document are retained with
 * a `rejected` status rather than deleted, so the decision itself stays
 * inspectable: "a human looked at this and declined it" is different from "this
 * never existed".
 *
 * @see docs/REQUIREMENTS.md FR-4.6
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let extractionId: string;
  try {
    const body = (await request.json()) as { extractionId?: unknown };
    extractionId = String(body.extractionId ?? '');
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  if (extractionId.length === 0) {
    return NextResponse.json({ error: 'extractionId is required.' }, { status: 400 });
  }

  const client = await createClient();

  // RLS scopes the update, so an extraction belonging to someone else matches
  // no row and reports as not found — which is what it should look like.
  const { data, error } = await client
    .from('extractions')
    .update({ status: 'rejected' })
    .eq('id', extractionId)
    .select('id')
    .maybeSingle();

  if (error !== null) {
    return NextResponse.json(
      { error: `Could not discard the extraction: ${error.message}` },
      { status: 500 },
    );
  }
  if (data === null) {
    return NextResponse.json({ error: 'Extraction not found.' }, { status: 404 });
  }

  return NextResponse.json({ extractionId, status: 'rejected' });
}
