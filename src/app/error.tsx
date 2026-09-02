'use client';

/**
 * Route-level error boundary.
 *
 * Until now an unhandled render error showed Next's default screen, which in
 * production is an unstyled "Application error" with no way forward. For a tool
 * whose whole argument is that failures should be legible rather than smoothed
 * over, that was the wrong last impression.
 *
 * Deliberately says what is and is not known. The digest is shown because it is
 * the only handle a user can quote; the message is not, because in a production
 * build it is a minified string that tells a reader nothing and may leak the
 * shape of internals.
 *
 * @see docs/DESIGN.md §5 — cross-cutting states
 */

import { useEffect } from 'react';
import { Button, EmptyState, PageShell } from '@/components/ui';

export default function RouteError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // The server already logged this; repeating it client-side is what makes it
    // visible in a browser console during a demo, which is where it is needed.
    console.error('Route error:', error);
  }, [error]);

  return (
    <PageShell>
      <EmptyState title="That screen failed to load.">
        Something went wrong rendering this page. Nothing was changed — reconciliation runs are
        append-only, so no data is in a half-written state.
        {error.digest !== undefined && (
          <>
            {' '}
            Reference <span className="font-mono text-ink">{error.digest}</span>.
          </>
        )}
      </EmptyState>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </PageShell>
  );
}
