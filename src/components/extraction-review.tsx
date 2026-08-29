'use client';

/**
 * Extraction review — the human gate (docs/DESIGN.md §S-4).
 *
 * This screen is the product's central claim made visible: the model read a
 * document, it was unsure about some of what it read, and nothing enters the
 * ledger until a person says so.
 *
 * Two commitments shape the layout. The document and the extracted fields sit
 * side by side, because verifying a figure means seeing both without switching
 * context. And every field is editable — the reviewer's job is to *correct* a
 * misreading, not merely to approve or reject it wholesale.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** One extracted value with the model's confidence in it. */
export interface ReviewField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly confidence: number;
}

/** An extraction awaiting review. */
export interface ReviewItem {
  readonly extractionId: string;
  readonly datasetId: string;
  readonly side: 'source' | 'ledger';
  readonly documentUrl: string | null;
  readonly mimeType: string;
  readonly status: string;
  readonly error: string | null;
  readonly modelId: string | null;
  readonly threshold: number;
  readonly fields: readonly ReviewField[];
}

export function ExtractionReview({ item }: { readonly item: ReviewItem }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(item.fields.map((field) => [field.name, field.value])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const belowThreshold = item.fields.filter((field) => field.confidence < item.threshold);

  const confirm = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const response = await fetch('/api/extract/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extractionId: item.extractionId,
        datasetId: item.datasetId,
        side: item.side,
        confirmed: values,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? 'Could not confirm this extraction.');
      setSaving(false);
      return;
    }
    router.refresh();
  };

  if (item.status === 'failed') {
    return (
      <article className="border border-rule bg-paper p-5">
        <h3 className="text-sm font-semibold text-unaccounted">Could not read this document</h3>
        <p className="mt-1 text-sm text-ink-muted">{item.error ?? 'The model returned no result.'}</p>
        {/* Stated explicitly: the most useful thing a reader can know after a
            failure is that nothing was silently written. */}
        <p className="mt-3 text-sm">Your ledger was not modified.</p>
      </article>
    );
  }

  return (
    <article className="grid gap-6 border border-rule bg-paper p-5 lg:grid-cols-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Document
        </h3>
        <div className="mt-2 border border-rule bg-paper-sunk">
          {item.documentUrl === null ? (
            <p className="p-6 text-sm text-ink-muted">Preview unavailable.</p>
          ) : item.mimeType === 'application/pdf' ? (
            <iframe
              src={item.documentUrl}
              title="Uploaded document"
              className="h-[30rem] w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL from storage, not a static asset
            <img src={item.documentUrl} alt="Uploaded document" className="w-full" />
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Extracted fields
        </h3>

        <div className="mt-2 divide-y divide-rule">
          {item.fields.map((field) => {
            const flagged = field.confidence < item.threshold;
            return (
              <label key={field.name} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-sm text-ink-muted">{field.label}</span>
                <input
                  value={values[field.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                  className={`min-w-0 flex-1 rounded-sm border px-2 py-1 font-mono text-sm ${
                    flagged ? 'border-undecided bg-undecided-wash' : 'border-rule bg-paper'
                  }`}
                />
                {/* Confidence as a bar for scanning and a number for judgement —
                    each does one job. */}
                <span className="flex w-20 shrink-0 items-center gap-1.5">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-paper-sunk">
                    <span
                      className={`block h-full ${flagged ? 'bg-undecided' : 'bg-settled'}`}
                      style={{ width: `${Math.round(field.confidence * 100)}%` }}
                    />
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                    {Math.round(field.confidence * 100)}%
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {belowThreshold.length > 0 && (
          <p className="mt-4 border-l-2 border-undecided bg-undecided-wash px-3 py-2 text-sm">
            {belowThreshold.length} field{belowThreshold.length === 1 ? '' : 's'} below{' '}
            {Math.round(item.threshold * 100)}% confidence. This record is blocked from the ledger
            until you confirm it.
          </p>
        )}

        {error !== null && (
          <p role="alert" className="mt-3 border-l-2 border-unaccounted bg-unaccounted-wash px-3 py-2 text-sm text-unaccounted">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving}
            className="rounded-sm bg-ink px-4 py-1.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Confirm and add to ledger'}
          </button>
          {item.modelId !== null && (
            <span className="font-mono text-[11px] text-ink-faint">read by {item.modelId}</span>
          )}
        </div>
      </div>
    </article>
  );
}
