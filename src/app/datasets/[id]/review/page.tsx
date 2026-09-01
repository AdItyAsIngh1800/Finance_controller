/**
 * Extraction review queue (docs/DESIGN.md §S-4).
 *
 * Lists every extraction that has not yet been confirmed. An empty queue is a
 * success state, not an empty table — it means nothing is waiting on a human.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CONFIDENCE_THRESHOLD, EXTRACTED_FIELDS } from '@/ai/extract';
import { AppHeader, Breadcrumb, PageHeading } from '@/components/app-header';
import { ExtractionReview, type ReviewItem } from '@/components/extraction-review';
import { buttonClasses, EmptyState, PageShell } from '@/components/ui';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** How long a preview link stays valid. Long enough to review, not indefinite. */
const SIGNED_URL_SECONDS = 60 * 30;

/** Human labels for the extracted fields. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  reference: 'Reference',
  date: 'Date',
  gross: 'Gross',
  fees: 'Fees',
  refunds: 'Refunds',
  chargebacks: 'Chargebacks',
  net: 'Net',
};

/** An extraction row joined to its document. */
interface ExtractionRow {
  readonly id: string;
  readonly status: string;
  readonly fields: Record<string, { value?: string; confidence?: number }> | null;
  readonly model_id: string | null;
  readonly error: string | null;
  readonly documents: {
    readonly id: string;
    readonly side: 'source' | 'ledger';
    readonly storage_path: string;
    readonly mime_type: string;
    readonly dataset_id: string;
  } | null;
}

export default async function ReviewPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [client, user] = await Promise.all([createClient(), getCurrentUser()]);

  const { data: dataset } = await client
    .from('datasets')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (dataset === null) notFound();

  const { data } = await client
    .from('extractions')
    .select(
      'id, status, fields, model_id, error, documents!inner(id, side, storage_path, mime_type, dataset_id)',
    )
    .in('status', ['pending', 'needs_review', 'failed'])
    .order('created_at', { ascending: true });

  const rows = ((data ?? []) as unknown as ExtractionRow[]).filter(
    (row) => row.documents?.dataset_id === id,
  );

  const items: ReviewItem[] = await Promise.all(
    rows.map(async (row) => {
      const document = row.documents;
      let documentUrl: string | null = null;
      if (document !== null) {
        const { data: signed } = await client.storage
          .from('documents')
          .createSignedUrl(document.storage_path, SIGNED_URL_SECONDS);
        documentUrl = signed?.signedUrl ?? null;
      }

      return {
        extractionId: row.id,
        datasetId: id,
        side: document?.side ?? 'source',
        documentUrl,
        mimeType: document?.mime_type ?? 'application/pdf',
        status: row.status,
        error: row.error,
        modelId: row.model_id,
        threshold: CONFIDENCE_THRESHOLD,
        fields: EXTRACTED_FIELDS.map((name) => ({
          name,
          label: FIELD_LABELS[name] ?? name,
          value: row.fields?.[name]?.value ?? '',
          confidence: row.fields?.[name]?.confidence ?? 0,
        })),
      };
    }),
  );

  const datasetName = (dataset as { name: string }).name;

  return (
    <>
      <AppHeader email={user?.email} />
      <PageShell width="wide">
        <Breadcrumb
          items={[
            { label: 'Datasets', href: '/datasets' },
            { label: datasetName, href: `/datasets/${id}` },
            { label: 'Review' },
          ]}
        />

        <div className="mt-3">
          <PageHeading
            title="Awaiting review"
            description="The model read these documents but was not confident about every field. Nothing here has entered the ledger. Correct anything it misread, then confirm."
          />
        </div>

        {items.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="Nothing waiting."
              action={
                <Link href={`/datasets/${id}`} className={buttonClasses()}>
                  Back to the dataset
                </Link>
              }
            >
              Every uploaded document has been dealt with — added to the ledger, or discarded.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {items.map((item) => (
              <ExtractionReview key={item.extractionId} item={item} />
            ))}
          </div>
        )}
      </PageShell>
    </>
  );
}
