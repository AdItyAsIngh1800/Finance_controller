/**
 * Severity presentation.
 *
 * Colour never carries the meaning alone: every badge pairs its colour with a
 * written label and a filled/half/hollow marker, so the encoding survives
 * greyscale printing and colour-vision differences alike.
 *
 * @see docs/REQUIREMENTS.md NFR-5.4
 */

import type { Severity } from '@/core/taxonomy';

/** Colour, label and marker for each severity. */
const PRESENTATION: Readonly<
  Record<Severity, { label: string; text: string; wash: string; marker: string }>
> = {
  high: {
    label: 'High',
    text: 'text-unaccounted',
    wash: 'bg-unaccounted-wash border-unaccounted/30',
    // Filled: money is unaccounted for.
    marker: '●',
  },
  medium: {
    label: 'Medium',
    text: 'text-undecided',
    wash: 'bg-undecided-wash border-undecided/30',
    // Half: awaiting a human decision.
    marker: '◐',
  },
  low: {
    label: 'Low',
    text: 'text-explained',
    wash: 'bg-explained-wash border-explained/25',
    // Hollow: explained — the money is accounted for.
    marker: '○',
  },
};

/**
 * A severity badge.
 *
 * @param props.severity - Which severity to render.
 */
export function SeverityBadge({ severity }: { readonly severity: Severity }) {
  const style = PRESENTATION[severity];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${style.wash} ${style.text}`}
    >
      <span aria-hidden="true">{style.marker}</span>
      {style.label}
    </span>
  );
}
