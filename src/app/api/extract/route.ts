/**
 * Document extraction endpoint (Stage 1).
 *
 * Stores the uploaded document, reads it with the model, and records the result
 * — including, crucially, whether it cleared the confidence gate. Nothing
 * reaches the ledger here. Promotion happens only after a human reviews it.
 *
 * @see docs/REQUIREMENTS.md FR-4
 * @module
 */

import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { extractSettlementDocument } from '@/ai/extract';
import { isRecordSide } from '@/core/taxonomy';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** Ceiling on an uploaded document. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Media types the model can read. */
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user === null) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

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
    return NextResponse.json({ error: 'A document is required.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Document is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Cannot read "${file.type}". Upload a PDF or an image.` },
      { status: 415 },
    );
  }

  const client = await createClient();
  const { data: dataset } = await client
    .from('datasets')
    .select('id')
    .eq('id', datasetId)
    .maybeSingle();
  if (dataset === null) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });

  // Objects live under the owner's id, which is what the storage policy keys on.
  const storagePath = `${user.id}/${datasetId}/${randomUUID()}-${file.name}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await client.storage
    .from('documents')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError !== null) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: document, error: documentError } = await client
    .from('documents')
    .insert({
      user_id: user.id,
      dataset_id: datasetId,
      side,
      storage_path: storagePath,
      mime_type: file.type,
      byte_size: file.size,
    })
    .select('id')
    .single();
  if (documentError !== null || document === null) {
    return NextResponse.json(
      { error: `Could not record the document: ${documentError?.message ?? 'no row'}` },
      { status: 500 },
    );
  }
  const documentId = (document as { id: string }).id;

  // Extraction never throws for a model or network failure; it returns a
  // `failed` outcome so the ledger is left untouched and the reason is stored.
  const outcome = await extractSettlementDocument({ data: bytes, mimeType: file.type });

  const { data: extraction, error: extractionError } = await client
    .from('extractions')
    .insert({
      user_id: user.id,
      document_id: documentId,
      status: outcome.status,
      fields: outcome.fields,
      min_confidence: outcome.minConfidence,
      model_id: outcome.modelId,
      error: outcome.error ?? null,
    })
    .select('id')
    .single();
  if (extractionError !== null || extraction === null) {
    return NextResponse.json(
      { error: `Could not record the extraction: ${extractionError?.message ?? 'no row'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documentId,
    extractionId: (extraction as { id: string }).id,
    status: outcome.status,
    fields: outcome.fields,
    minConfidence: outcome.minConfidence,
    lowConfidenceFields: outcome.lowConfidenceFields,
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
  });
}
