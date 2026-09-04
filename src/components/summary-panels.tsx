'use client';

/**
 * The run's headline figures, arranged as sheets on a desk.
 *
 * Replaces the four equal cards of `SummaryCards` on the run screen. That row
 * had two problems, and the second is the reason this component exists rather
 * than a `className` tweak:
 *
 * 1. **It restated the match rate.** The figure appeared here at `text-3xl` and
 *    again a few hundred pixels below at `text-6xl`, under the double rule. The
 *    page carried a comment excusing this as "scanning versus interrogating",
 *    which is a real distinction that does not survive the two blocks being
 *    stacked in the same viewport. The closing figure is now stated once.
 * 2. **Four identical cards read as generated.** Equal size, equal plane, equal
 *    elevation, equal radius: the arrangement of a layout that had no argument
 *    about which number matters most.
 *
 * So the panels differ — in plane, elevation, size and vertical offset — and
 * the differences are not arbitrary. `globals.css` already defines four surface
 * steps and three elevations; this component spends them, it does not invent
 * new ones.
 *
 * **The match rate is inset, and never moves.** In double-entry bookkeeping a
 * closing figure is what everything above it resolves to. It sits on the sunk
 * plane, carries no shadow, and is the one panel that cannot be picked up. Every
 * other figure is a sheet resting on the surface it is cut into. That is the
 * whole idea: the variance carries the accounting semantics, which is what
 * separates a considered arrangement from randomised offsets.
 *
 * @see docs/DESIGN.md §2 — the three planes
 * @see docs/DESIGN.md §S-5 — reconciliation dashboard
 */

import type { ReactNode } from 'react';
import { Card, type CardPlane } from './ui';

/**
 * A queue filter a panel applies when picked up.
 *
 * Deliberately a closed union rather than an arbitrary predicate: a panel may
 * only narrow the queue to a subset the queue can actually render, so picking a
 * panel up can never claim a view the table cannot produce.
 *
 * One member today, because exactly one of the run's four figures names a
 * subset of the findings. Widen it when a figure that narrows the queue is
 * added, not before — a filter with no panel behind it is dead code that reads
 * as a missing feature.
 */
export type PanelFilter = 'open';

/** One figure, as the caller supplies it. */
export interface SummaryPanel {
  readonly label: string;
  /** Pre-formatted. Money originates as `bigint` and cannot cross to a Client
   *  Component; converting to `number` would readmit floats to the money path. */
  readonly value: string;
  /** Optional qualifier under the figure — a denominator, a share, a caveat. */
  readonly detail?: string;
  /**
   * Draws the figure in a semantic colour. Reserved for counts that are
   * actionable, so the coloured figure still reads as the exception rather
   * than as one of four equally urgent numbers.
   */
  readonly tone?: 'unaccounted' | 'settled';
  /**
   * What picking this panel up does to the queue below.
   *
   * **Absent means inert, and inert panels are not buttons.** Only two of these
   * figures narrow to anything the exception queue can show: "transactions
   * processed" and "value reconciled" describe the run, not a subset of the
   * findings. Giving them a satisfying press with no consequence would be an
   * affordance that lies, so they stay as plain sheets — they differ in depth
   * like the others, they simply do not invite a click.
   */
  readonly filter?: PanelFilter;
}

/**
 * Where each panel sits, by index.
 *
 * Hard-coded against position rather than passed in, because the arrangement
 * *is* the design: a caller free to put the closing figure on the ink plane
 * would be free to undo the point of the component. Four entries because the
 * run screen shows four figures; a fifth would need a considered home rather
 * than a wrapped grid cell.
 *
 * The offsets are small and only above `lg`. Below that the panels stack in one
 * column, where a negative margin would read as a mistake rather than as a
 * sheet slid under its neighbour.
 */
const ARRANGEMENT: readonly {
  plane: CardPlane;
  area: string;
  size: 'lg' | 'md' | 'sm';
  /** Draws the double rule under the figure. Slot 0 only, by definition. */
  closing?: boolean;
}[] = [
  // The closing figure. Inset, immovable, spanning both rows, under the double
  // rule that bookkeeping reserves for a final total.
  { plane: 'sunk', area: 'lg:col-start-1 lg:row-start-1 lg:row-span-2', size: 'lg', closing: true },
  // The count still to review. The heaviest sheet, on the ink plane, full height.
  { plane: 'ink', area: 'lg:col-start-2 lg:row-start-1 lg:row-span-2', size: 'md' },
  // Two lighter sheets, stacked, each slipped a few pixels off the grid.
  { plane: 'floating', area: 'lg:col-start-3 lg:row-start-1 lg:mt-2', size: 'sm' },
  { plane: 'raised', area: 'lg:col-start-3 lg:row-start-2 lg:-mt-3', size: 'sm' },
];

/** Figure size per slot, so the arrangement has a type hierarchy as well as a depth one. */
const FIGURE_SIZE: Readonly<Record<'lg' | 'md' | 'sm', string>> = {
  lg: 'text-5xl sm:text-6xl',
  md: 'text-3xl sm:text-4xl',
  sm: 'text-2xl sm:text-3xl',
};

const TONE: Readonly<Record<'unaccounted' | 'settled', string>> = {
  unaccounted: 'text-unaccounted',
  settled: 'text-settled',
};

/**
 * Picked-up appearance.
 *
 * One plane step up and one elevation step up, held for as long as the filter
 * is on. Depth is therefore *state*, not decoration: a reviewer can see which
 * figure is narrowing the queue without reading a control.
 *
 * The lift is a `translate`, never a `top` or a `height`, so it composites on
 * the GPU. `--ease-spring` is reserved for exactly this transition.
 */
const PICKED_UP = 'shadow-lift-lg -translate-y-0.5';

/**
 * The panels.
 *
 * @param props.panels - Four figures, in the order the arrangement expects:
 *   closing figure, unaccounted total, then two supporting counts.
 * @param props.active - Which filter the queue is currently showing, so the
 *   matching panel renders picked up. Owned by `RunWorkspace`, which is the
 *   component whose job is state crossing between the panels and the queue.
 * @param props.onFilter - Applies or clears a filter. Called with `null` when
 *   an already-active panel is clicked, which puts it back down.
 */
export function SummaryPanels({
  panels,
  active,
  onFilter,
}: {
  readonly panels: readonly SummaryPanel[];
  readonly active: PanelFilter | null;
  readonly onFilter: (filter: PanelFilter | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr] lg:grid-rows-2 lg:items-start lg:gap-4">
      {panels.map((panel, index) => {
        const slot = ARRANGEMENT[index];
        if (slot === undefined) return null;

        const isActive = panel.filter !== undefined && panel.filter === active;
        const body = (
          <PanelBody
            panel={panel}
            size={slot.size}
            plane={slot.plane}
            active={isActive}
            closing={slot.closing === true}
          />
        );

        // An inert figure is a `div`. Only a panel that does something is a
        // button, so nothing announces itself to a keyboard or a screen reader
        // as operable when it is not.
        if (panel.filter === undefined) {
          return (
            <Card key={panel.label} plane={slot.plane} className={`p-5 ${slot.area}`}>
              {body}
            </Card>
          );
        }

        return (
          <button
            key={panel.label}
            type="button"
            aria-pressed={isActive}
            onClick={() => onFilter(isActive ? null : panel.filter ?? null)}
            className={`cursor-pointer rounded-card border p-5 text-left transition-[box-shadow,translate,background-color] duration-[450ms] ease-[var(--ease-spring)] active:translate-y-px active:shadow-lift-sm ${
              slot.plane === 'ink'
                ? 'border-ink bg-ink text-paper'
                : 'border-rule bg-paper-raised'
            } ${isActive ? PICKED_UP : 'shadow-lift-md'} ${slot.area}`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The figure, its label and its qualifier.
 *
 * Split out so the button and the plain-sheet branches above cannot drift in
 * how they render the same content.
 */
function PanelBody({
  panel,
  size,
  plane,
  active,
  closing,
}: {
  readonly panel: SummaryPanel;
  readonly size: 'lg' | 'md' | 'sm';
  readonly plane: CardPlane;
  readonly active: boolean;
  readonly closing: boolean;
}): ReactNode {
  // On the ink plane the semantic tones have not been measured for contrast,
  // and the plane itself already carries the emphasis the tone would add.
  const onInk = plane === 'ink';
  const figureTone = onInk || panel.tone === undefined ? '' : TONE[panel.tone];

  return (
    <>
      <p className={`text-xs ${onInk ? 'text-paper/70' : 'text-ink-muted'}`}>{panel.label}</p>
      <p
        className={`mt-1.5 font-medium tracking-tight ${FIGURE_SIZE[size]} ${figureTone} ${
          closing ? 'rule-closing pb-2' : ''
        }`}
      >
        {panel.value}
      </p>
      {panel.detail !== undefined && (
        <p className={`mt-1 text-xs ${onInk ? 'text-paper/70' : 'text-ink-muted'}`}>
          {panel.detail}
        </p>
      )}
      {panel.filter !== undefined && (
        <p className={`mt-3 text-xs font-medium ${onInk ? 'text-paper/80' : 'text-accent'}`}>
          {active ? 'Filtering the queue. Click to clear.' : 'Click to filter the queue'}
        </p>
      )}
    </>
  );
}
