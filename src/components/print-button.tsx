'use client';

/**
 * Opens the browser's print dialogue for the reconciliation summary.
 *
 * "Save as PDF" is in the label because that is what most people will actually
 * do with it, and a button labelled only "Print" reads as useless to someone
 * without a printer.
 *
 * `window.print()` is the whole implementation. The report's layout lives in
 * the print stylesheet, so this control has no knowledge of it.
 */

import { Button } from './ui';

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 8V3.5h8V8M6 15.5H4.5v-6h11v6H14" strokeLinejoin="round" />
        <path d="M6 12.5h8v4H6z" strokeLinejoin="round" />
      </svg>
      Print / Save as PDF
    </Button>
  );
}
