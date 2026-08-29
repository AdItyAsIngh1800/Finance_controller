/**
 * Promotes a reviewed extraction into a ledger record.
 *
 * The human gate. Values arrive as the reviewer confirmed them, which may
 * differ from what the model read — correcting a misread figure is the entire
 * point of the review screen.
 *
 * @see docs/REQUIREMENTS.md FR-4.6
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isRecordSide } from '@/core/taxonomy';
import { promoteExtraction } from '@/lib/pipeline';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: {
    extractionId?: unknown;
    datasetId?: unknown;
    side?: unknown;
    confirmed?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const extractionId = String(body.extractionId ?? '');
  const datasetId = String(body.datasetId ?? '');
  const side = String(body.side ?? '');
  const confirmed = body.confirmed;

  if (extractionId.length === 0 || datasetId.length === 0) {
    return NextResponse.json({ error: 'extractionId and datasetId are required.' }, { status: 400 });
  }
  if (!isRecordSide(side)) {
    return NextResponse.json({ error: `Unknown side: ${side}` }, { status: 400 });
  }
  if (confirmed === null || typeof confirmed !== 'object') {
    return NextResponse.json({ error: 'Confirmed field values are required.' }, { status: 400 });
  }

  const values = Object.fromEntries(
    Object.entries(confirmed as Record<string, unknown>).map(([key, value]) => [
      key,
      String(value ?? ''),
    ]),
  );

  try {
    const recordId = await promoteExtraction(await createClient(), {
      extractionId,
      datasetId,
      userId: user.id,
      side,
      confirmed: values,
    });
    return NextResponse.json({ recordId });
  } catch (cause) {
    // Parse failures land here — an amount with excess precision, an impossible
    // date. The message names the specific field so the reviewer can fix it.
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Could not confirm the extraction.' },
      { status: 422 },
    );
  }
}
