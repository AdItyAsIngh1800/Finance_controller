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
import { Button, Notice } from './ui';

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
    <div className="flex flex-col items-center">
      <Button variant="primary" onClick={() => void seed()} disabled={state === 'seeding'}>
        {state === 'seeding' ? 'Preparing demo data…' : 'Load a demo dataset'}
      </Button>
      <p className="mt-2 text-xs text-ink-muted">
        250 record pairs with known discrepancies planted, reconciled immediately.
      </p>
      {message !== null && (
        <Notice tone="error" className="mt-3 text-left">
          {message}
        </Notice>
      )}
    </div>
  );
}
