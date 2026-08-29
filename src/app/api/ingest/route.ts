/**
 * CSV ingestion endpoint.
 *
 * Accepts a multipart upload and replaces one side of a dataset with its
 * contents. Rejection is all-or-nothing: a single malformed row rejects the
 * file, with every offending line reported at once.
 *
 * @see docs/REQUIREMENTS.md FR-3
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isRecordSide } from '@/core/taxonomy';
import { ingestCsv } from '@/lib/pipeline';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/**
 * Upload ceiling.
 *
 * A settlement export of a few thousand rows is well under a megabyte; ten
 * gives generous headroom while keeping a hostile or mistaken upload from
 * exhausting request memory.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Content types a CSV upload plausibly arrives as, across browsers and OSes. */
const ACCEPTED_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  '',
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const form = await request.formData();
  const datasetId = String(form.get('datasetId') ?? '');
  const side = String(form.get('side') ?? '');
  const file = form.get('file');

  if (datasetId.length === 0) {
    return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 });
  }
  if (!isRecordSide(side)) {
    return NextResponse.json({ error: `Unknown side: ${side}` }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A CSV file is required.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Expected a CSV file, received "${file.type}".` },
      { status: 415 },
    );
  }

  const client = await createClient();

  // Reading the dataset also confirms ownership: RLS returns nothing for a
  // dataset belonging to someone else, so this doubles as the access check.
  const { data: dataset, error } = await client
    .from('datasets')
    .select('id, domain')
    .eq('id', datasetId)
    .maybeSingle();

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (dataset === null) {
    return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
  }

  try {
    const result = await ingestCsv(client, {
      datasetId,
      userId: user.id,
      domain: (dataset as { domain: 'settlement' | 'bank' }).domain,
      side,
      text: await file.text(),
    });

    if (result.errors.length > 0) {
      // 422: the request was well-formed but its contents could not be used.
      return NextResponse.json(
        {
          error: `Upload rejected: ${result.errors.length} row(s) could not be read. Nothing was saved.`,
          rows: result.errors,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ inserted: result.inserted });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Ingestion failed.' },
      { status: 500 },
    );
  }
}
