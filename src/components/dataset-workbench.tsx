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

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  sourceCount,
  ledgerCount,
}: {
  readonly datasetId: string;
  readonly sourceCount: number;
  readonly ledgerCount: number;
}) {
  const router = useRouter();
  const [source, setSource] = useState<SideState>(IDLE);
  const [ledger, setLedger] = useState<SideState>(IDLE);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const setFor = (side: 'source' | 'ledger', state: SideState): void =>
    (side === 'source' ? setSource : setLedger)(state);

  /** Uploads one side, replacing whatever was there. */
  const upload = async (side: 'source' | 'ledger', file: File): Promise<void> => {
    setFor(side, { status: 'uploading' });
    const body = new FormData();
    body.set('datasetId', datasetId);
    body.set('side', side);
    body.set('file', file);

    const response = await fetch('/api/ingest', { method: 'POST', body });
    const payload = (await response.json()) as {
      inserted?: number;
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
          title="What the processor says"
          hint="Settlement report or bank statement"
          count={sourceCount}
          state={source}
          onFile={(file) => void upload('source', file)}
        />
        <UploadPanel
          title="What your books say"
          hint="Ledger or revenue export"
          count={ledgerCount}
          state={ledger}
          onFile={(file) => void upload('ledger', file)}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void reconcile()}
          disabled={!bothSidesLoaded || running}
          className="rounded-sm bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Reconciling…' : 'Reconcile'}
        </button>
        {!bothSidesLoaded && (
          // Disabled controls always say why. A greyed-out button with no
          // explanation is a dead end.
          <p className="text-sm text-ink-muted">
            Load both sides to reconcile.
          </p>
        )}
      </div>

      {runError !== null && (
        <p role="alert" className="mt-4 border-l-2 border-unaccounted bg-unaccounted-wash px-3 py-2 text-sm text-unaccounted">
          {runError}
        </p>
      )}
    </div>
  );
}

/** One side's upload panel. */
function UploadPanel({
  title,
  hint,
  count,
  state,
  onFile,
}: {
  readonly title: string;
  readonly hint: string;
  readonly count: number;
  readonly state: SideState;
  readonly onFile: (file: File) => void;
}) {
  return (
    <div className="border border-rule bg-paper p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>

      <label className="mt-4 block">
        <span className="sr-only">Choose a CSV file for {title}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={state.status === 'uploading'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) onFile(file);
          }}
          className="w-full text-xs file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-rule file:bg-paper-sunk file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </label>

      <p className="mt-3 font-mono text-xs text-ink-muted">
        {state.status === 'uploading'
          ? 'Reading…'
          : `${count.toLocaleString()} record${count === 1 ? '' : 's'} loaded`}
      </p>

      {state.status === 'error' && (
        <div role="alert" className="mt-3 border-l-2 border-unaccounted bg-unaccounted-wash px-3 py-2">
          <p className="text-xs text-unaccounted">{state.message}</p>
          {state.rows !== undefined && state.rows.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-unaccounted">
              {state.rows.slice(0, 8).map((row) => (
                <li key={`${row.lineNumber}-${row.column ?? ''}`}>
                  line {row.lineNumber}
                  {row.column === undefined ? '' : ` · ${row.column}`} — {row.reason}
                </li>
              ))}
              {state.rows.length > 8 && <li>…and {state.rows.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}

      {state.status === 'done' && (
        <p className="mt-3 text-xs text-settled">{state.message}</p>
      )}
    </div>
  );
}
