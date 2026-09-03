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
import { promoteExtraction } from '@/lib/pipeline';
import { consume } from '@/lib/rate-limit';
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

  /*
   * Budget check, immediately after authentication and before any work.
   *
   * Placed here rather than deeper in the handler so a refused call costs a map
   * lookup instead of a file read, a storage write and a model round trip.
   * `Retry-After` is set because a 429 without it tells a client to guess.
   */
  const budget = consume('extract', user.id);
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
    .select('id, domain')
    .eq('id', datasetId)
    .maybeSingle();
  if (dataset === null) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });

  // Document extraction reads settlement statements only. The schema, the
  // prompt, and the promotion path all describe a gross/fees/net breakdown that
  // a bank statement does not have.
  //
  // Refusing is deliberate rather than a placeholder. Reading a bank statement
  // with a settlement schema would produce fields that look plausible and are
  // wrong — silently, and in the one place this system promises not to guess.
  // Bank data is ingested as CSV, where the columns are unambiguous.
  if ((dataset as { domain: string }).domain !== 'settlement') {
    return NextResponse.json(
      {
        error:
          'Document extraction currently reads settlement statements only. ' +
          'Upload a CSV for a bank dataset.',
      },
      { status: 422 },
    );
  }

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

  const extractionId = (extraction as { id: string }).id;

  // An extraction that cleared the confidence gate is promoted immediately.
  //
  // The human gate exists for *uncertain* readings, not for every reading —
  // docs/ARCHITECTURE.md §5 routes `confirmed` straight to a record and only
  // `needs_review` through a person. Without this the document is read, marked
  // confirmed, and then silently dropped: it never reaches the ledger, and it
  // never appears in the review queue either, because that queue lists only
  // items still awaiting a decision.
  let promotedRecordId: string | null = null;
  if (outcome.status === 'confirmed') {
    const confirmed = Object.fromEntries(
      Object.entries(outcome.fields).map(([name, field]) => [name, field?.value ?? '']),
    );
    try {
      promotedRecordId = await promoteExtraction(client, {
        extractionId,
        datasetId,
        userId: user.id,
        side,
        confirmed,
      });
    } catch (cause) {
      // Confident but unusable — an amount with excess precision, an impossible
      // date. Route it to a human rather than discarding it: the reading may be
      // correct and merely need a correction the parser cannot make itself.
      await client
        .from('extractions')
        .update({
          status: 'needs_review',
          error: cause instanceof Error ? cause.message : String(cause),
        })
        .eq('id', extractionId);

      return NextResponse.json({
        documentId,
        extractionId,
        status: 'needs_review',
        fields: outcome.fields,
        minConfidence: outcome.minConfidence,
        lowConfidenceFields: outcome.lowConfidenceFields,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return NextResponse.json({
    documentId,
    extractionId,
    status: outcome.status,
    fields: outcome.fields,
    minConfidence: outcome.minConfidence,
    lowConfidenceFields: outcome.lowConfidenceFields,
    ...(promotedRecordId === null ? {} : { recordId: promotedRecordId }),
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
  });
}
