'use client';

/**
 * Deleting a dataset.
 *
 * Two-step rather than a single button: this removes every record, run,
 * exception and uploaded document belonging to the dataset, and it cannot be
 * undone. The second click states the consequence rather than asking a bare
 * "are you sure?", which people click past without reading.
 *
 * A native `confirm()` would be less code and worse — it cannot say what is
 * about to be destroyed, and it is not styled with the rest of the interface.
 */

import { useState } from 'react';

export function DeleteDataset({
  datasetId,
  name,
  action,
}: {
  readonly datasetId: string;
  readonly name: string;
  /** Server action performing the deletion. */
  readonly action: (formData: FormData) => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-sm text-xs text-ink-muted underline underline-offset-2 transition-colors duration-150 ease-ui hover:text-unaccounted"
      >
        Delete
      </button>
    );
  }

  // The row already names the dataset, so the confirmation does not repeat it —
  // doing so forced the table's other columns to wrap. The consequence is what
  // needs stating, and that goes on the button itself rather than in a
  // preamble nobody reads.
  return (
    <form action={action} className="flex items-center justify-end gap-2 whitespace-nowrap">
      <input type="hidden" name="datasetId" value={datasetId} />
      <span className="sr-only">Delete {name} and everything in it?</span>
      <button
        type="submit"
        className="rounded-control border border-unaccounted px-2 py-1 text-xs font-medium text-unaccounted transition-colors duration-150 ease-ui hover:bg-unaccounted-wash"
      >
        Delete everything
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-sm text-xs text-ink-muted underline underline-offset-2 transition-colors duration-150 ease-ui hover:text-ink"
      >
        Keep
      </button>
    </form>
  );
}
