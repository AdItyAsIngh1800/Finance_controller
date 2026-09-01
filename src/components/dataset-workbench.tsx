'use client';

/**
 * Upload panels and the reconcile control (docs/DESIGN.md §S-3).
 *
 * The two sides are labelled by what they are to the user — what the processor
 * says, and what your books say — rather than by the schema's `source` and
 * `ledger`.
 *
 * Row-level rejections are shown in full. A file rejected for three bad rows
 * lists all three, because fixing them one upload at a time is the frustration
 * this screen exists to avoid.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Notice } from './ui';

/** A row the adapter could not read. */
interface RowError {
  readonly lineNumber: number;
  readonly column?: string;
  readonly reason: string;
}

/** Per-side upload state. */
interface SideState {
  readonly status: 'idle' | 'uploading' | 'done' | 'error';
  readonly message?: string;
  readonly rows?: readonly RowError[];
}

const IDLE: SideState = { status: 'idle' };

export function DatasetWorkbench({
  datasetId,
  domain,
  sourceCount,
  ledgerCount,
}: {
  readonly datasetId: string;
  /** Determines whether documents can be read, or only CSV accepted. */
  readonly domain: 'settlement' | 'bank';
  readonly sourceCount: number;
  readonly ledgerCount: number;
}) {
  // Only settlement statements can be read as documents. Rather than accept a
  // PDF and reject it after upload, the control does not offer one — a file
  // picker that lists a type the server will refuse is a small lie.
  const acceptsDocuments = domain === 'settlement';
  const router = useRouter();
  const [source, setSource] = useState<SideState>(IDLE);
  const [ledger, setLedger] = useState<SideState>(IDLE);
  const [running, setRunning] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const setFor = (side: 'source' | 'ledger', state: SideState): void =>
    (side === 'source' ? setSource : setLedger)(state);

  /**
   * Is this a document to be read, rather than a table to be parsed?
   *
   * Routing on content type rather than asking the user to pick means they can
   * drop whatever they have — a CSV export or a scanned advice — and the right
   * thing happens.
   */
  const isDocument = (file: File): boolean =>
    file.type === 'application/pdf' || file.type.startsWith('image/');

  /** Uploads one side: a CSV replaces it outright, a document goes for reading. */
  const upload = async (side: 'source' | 'ledger', file: File): Promise<void> => {
    setFor(side, { status: 'uploading' });
    const body = new FormData();
    body.set('datasetId', datasetId);
    body.set('side', side);
    body.set('file', file);

    const document = isDocument(file);
    const response = await fetch(document ? '/api/extract' : '/api/ingest', {
      method: 'POST',
      body,
    });
    const payload = (await response.json()) as {
      inserted?: number;
      status?: string;
      lowConfidenceFields?: string[];
      error?: string;
      rows?: RowError[];
    };

    if (!response.ok) {
      setFor(side, {
        status: 'error',
        message: payload.error ?? 'Upload failed.',
        ...(payload.rows === undefined ? {} : { rows: payload.rows }),
      });
      return;
    }

    if (document) {
      // An extraction never lands in the ledger directly. Say so plainly, and
      // point at the screen where it can be released.
      const flagged = payload.lowConfidenceFields ?? [];
      setFor(side, {
        status: 'done',
        message:
          payload.status === 'failed'
            ? 'Could not be read. Your ledger was not modified.'
            : flagged.length > 0
              ? `Read, but ${flagged.length} field${flagged.length === 1 ? '' : 's'} need review before it enters the ledger.`
              : 'Read cleanly and added to the ledger.',
      });
      if (payload.status !== 'confirmed') setNeedsReview(true);
      router.refresh();
      return;
    }

    setFor(side, { status: 'done', message: `${payload.inserted ?? 0} records loaded.` });
    router.refresh();
  };

  /** Runs reconciliation and navigates to the results. */
  const reconcile = async (): Promise<void> => {
    setRunning(true);
    setRunError(null);
    const response = await fetch('/api/recon/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId }),
    });
    const payload = (await response.json()) as { runId?: string; error?: string };

    if (!response.ok || payload.runId === undefined) {
      setRunError(payload.error ?? 'Reconciliation failed.');
      setRunning(false);
      return;
    }
    router.push(`/datasets/${datasetId}/runs/${payload.runId}`);
  };

  const bothSidesLoaded = sourceCount > 0 && ledgerCount > 0;

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <UploadPanel
          title={domain === 'bank' ? 'What the bank says' : 'What the processor says'}
          hint={acceptsDocuments ? 'CSV export, or a PDF or scan to be read' : 'CSV export'}
          acceptsDocuments={acceptsDocuments}
          count={sourceCount}
          state={source}
          onFile={(file) => void upload('source', file)}
        />
        <UploadPanel
          title="What your books say"
          hint={acceptsDocuments ? 'CSV export, or a PDF or scan to be read' : 'CSV export'}
          acceptsDocuments={acceptsDocuments}
          count={ledgerCount}
          state={ledger}
          onFile={(file) => void upload('ledger', file)}
        />
      </div>

      {needsReview && (
        <Notice tone="warning" className="mt-5">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            A document is waiting to be reviewed before it can enter the ledger.
            <Link
              href={`/datasets/${datasetId}/review`}
              className="rounded-sm font-medium underline underline-offset-2 transition-opacity duration-150 ease-ui hover:opacity-70"
            >
              Review it
            </Link>
          </span>
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          variant="primary"
          onClick={() => void reconcile()}
          disabled={!bothSidesLoaded || running}
        >
          {running ? 'Reconciling…' : 'Reconcile'}
        </Button>
        {!bothSidesLoaded && (
          // Disabled controls always say why. A greyed-out button with no
          // explanation is a dead end.
          <p className="text-sm text-ink-muted">Load both sides to reconcile.</p>
        )}
      </div>

      {runError !== null && (
        <Notice tone="error" className="mt-4">
          {runError}
        </Notice>
      )}
    </div>
  );
}

/** One side's upload panel. */
function UploadPanel({
  title,
  hint,
  acceptsDocuments,
  count,
  state,
  onFile,
}: {
  readonly title: string;
  readonly hint: string;
  readonly acceptsDocuments: boolean;
  readonly count: number;
  readonly state: SideState;
  readonly onFile: (file: File) => void;
}) {
  const busy = state.status === 'uploading';

  return (
    <Card className="flex flex-col p-4 transition-shadow duration-150 ease-ui hover:shadow-lift-md sm:p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>

      {/*
        The file input is the drop target, stretched over the dashed well and
        made transparent, so the whole area accepts a drag without any drag
        handlers of its own. The browser's own file semantics — keyboard
        activation, drop, the picker — all still apply.
      */}
      <label
        className={`relative mt-4 flex min-h-24 flex-col items-center justify-center rounded-control border border-dashed px-4 py-5 text-center transition-colors duration-150 ease-ui ${
          busy
            ? 'border-rule bg-paper-sunk'
            : 'border-rule-strong bg-paper-sunk/40 hover:border-ink-faint hover:bg-paper-sunk'
        }`}
      >
        <span className="sr-only">
          Choose a {acceptsDocuments ? 'CSV, PDF or image' : 'CSV'} file for {title}
        </span>
        <input
          type="file"
          accept={acceptsDocuments ? '.csv,text/csv,application/pdf,image/*' : '.csv,text/csv'}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) onFile(file);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span aria-hidden="true" className="text-base text-ink-faint">
          {busy ? '⋯' : '↑'}
        </span>
        <span className="mt-1 text-xs font-medium text-ink">
          {busy ? 'Reading…' : 'Drop a file, or choose one'}
        </span>
        <span className="mt-0.5 font-mono text-[11px] text-ink-muted">
          {count.toLocaleString()} record{count === 1 ? '' : 's'} loaded
        </span>
      </label>

      {state.status === 'error' && (
        <Notice tone="error" className="mt-3">
          <p className="text-xs">{state.message}</p>
          {state.rows !== undefined && state.rows.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
              {state.rows.slice(0, 8).map((row) => (
                <li key={`${row.lineNumber}-${row.column ?? ''}`}>
                  line {row.lineNumber}
                  {row.column === undefined ? '' : ` · ${row.column}`} — {row.reason}
                </li>
              ))}
              {state.rows.length > 8 && <li>…and {state.rows.length - 8} more</li>}
            </ul>
          )}
        </Notice>
      )}

      {state.status === 'done' && (
        <p className="mt-3 text-xs leading-relaxed text-settled">{state.message}</p>
      )}
    </Card>
  );
}
