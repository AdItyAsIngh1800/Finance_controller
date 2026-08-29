'use client';

/**
 * One-click demo seeding.
 *
 * A walkthrough should begin at results, not at an upload dialog. This creates
 * a dataset, loads both sides, and reconciles in a single action, so a
 * demonstration never depends on a file picker or a model call succeeding while
 * someone is watching.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SeedDemo() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'seeding' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const seed = async (): Promise<void> => {
    setState('seeding');
    setMessage(null);

    const response = await fetch('/api/demo/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'settlement' }),
    });
    const payload = (await response.json()) as {
      datasetId?: string;
      runId?: string;
      error?: string;
    };

    if (!response.ok || payload.datasetId === undefined || payload.runId === undefined) {
      setState('error');
      setMessage(payload.error ?? 'Could not seed the demo dataset.');
      return;
    }

    router.push(`/datasets/${payload.datasetId}/runs/${payload.runId}`);
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void seed()}
        disabled={state === 'seeding'}
        className="rounded-sm border border-rule bg-paper-sunk px-3 py-1.5 text-sm transition hover:bg-paper disabled:opacity-50"
      >
        {state === 'seeding' ? 'Preparing demo data…' : 'Load a demo dataset'}
      </button>
      <p className="mt-1.5 text-xs text-ink-muted">
        250 record pairs with known discrepancies planted, reconciled immediately.
      </p>
      {message !== null && (
        <p
          role="alert"
          className="mt-2 border-l-2 border-unaccounted bg-unaccounted-wash px-3 py-2 text-sm text-unaccounted"
        >
          {message}
        </p>
      )}
    </div>
  );
}
