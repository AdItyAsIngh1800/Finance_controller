'use client';

/**
 * Charts for a reconciliation run.
 *
 * §7 of DESIGN.md excluded charts on the grounds that "the interesting data is
 * tabular" and a pie of exception types is decoration. That was reversed on
 * 3 September 2026, with two constraints kept from the original argument:
 *
 * 1. **No pie.** Comparing angles is worse than comparing lengths at every size
 *    that matters, and the exception breakdown is a ranking — a horizontal bar
 *    chart reads it directly and keeps the type names legible without a legend.
 * 2. **Nothing plotted that is not measured.** There is no synthetic time axis
 *    here: the trend chart plots one point per actual run of this dataset, in
 *    the order they happened. A dataset reconciled once shows one point and
 *    says so, rather than inventing thirty days of history.
 *
 * Every colour is read from the CSS custom properties at render time rather
 * than hard-coded, so the charts follow the theme toggle like everything else.
 * Recharts takes concrete strings, not `var(...)`, so the values are resolved
 * from the document once on mount and again whenever the theme attribute
 * changes.
 *
 * @see docs/DESIGN.md §7.1.2
 */

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, EmptyState, SectionHeading } from './ui';

/** One bar: an exception type and how many of them the run produced. */
export interface TypeDatum {
  readonly type: string;
  readonly count: number;
  readonly severity: 'high' | 'medium' | 'low';
}

/** One point: a past run of this dataset. */
export interface TrendDatum {
  readonly label: string;
  readonly matchRate: number;
}

/** One bucket of the extraction-confidence histogram. */
export interface ConfidenceDatum {
  readonly bucket: string;
  readonly count: number;
  readonly belowThreshold: boolean;
}

/** The palette values the charts need, resolved from the document. */
interface Palette {
  readonly ink: string;
  readonly inkMuted: string;
  readonly rule: string;
  readonly unaccounted: string;
  readonly undecided: string;
  readonly explained: string;
  readonly settled: string;
  readonly accent: string;
}

const FALLBACK: Palette = {
  ink: '#0f1419',
  inkMuted: '#55606e',
  rule: '#dfe4ea',
  unaccounted: '#8a5206',
  undecided: '#2c5fc4',
  explained: '#55606e',
  settled: '#0b6b55',
  accent: '#2c5fc4',
};

/**
 * Reads the live palette off `:root`.
 *
 * Re-reads on a `data-theme` change. A `MutationObserver` on the one attribute
 * is the whole mechanism — the theme toggle sets that attribute and nothing
 * else, so there is no event to subscribe to and polling would be worse.
 */
function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(FALLBACK);

  useEffect(() => {
    const read = (): void => {
      const style = getComputedStyle(document.documentElement);
      const value = (name: string, fallback: string): string =>
        style.getPropertyValue(name).trim() || fallback;
      setPalette({
        ink: value('--ink', FALLBACK.ink),
        inkMuted: value('--ink-muted', FALLBACK.inkMuted),
        rule: value('--rule', FALLBACK.rule),
        unaccounted: value('--unaccounted', FALLBACK.unaccounted),
        undecided: value('--undecided', FALLBACK.undecided),
        explained: value('--explained', FALLBACK.explained),
        settled: value('--settled', FALLBACK.settled),
        accent: value('--accent', FALLBACK.accent),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return palette;
}

/** Tooltip styling shared by all three charts. */
function tooltipStyle(palette: Palette) {
  return {
    contentStyle: {
      background: 'var(--paper-raised)',
      border: `1px solid ${palette.rule}`,
      borderRadius: 'var(--radius-control)',
      fontSize: 12,
      color: palette.ink,
    },
    labelStyle: { color: palette.inkMuted },
    cursor: { fill: palette.rule, fillOpacity: 0.35 },
  };
}

export function RunCharts({
  byType,
  trend,
  confidence,
}: {
  readonly byType: readonly TypeDatum[];
  readonly trend: readonly TrendDatum[];
  readonly confidence: readonly ConfidenceDatum[];
}) {
  const palette = usePalette();
  const severityColour: Readonly<Record<TypeDatum['severity'], string>> = {
    high: palette.unaccounted,
    medium: palette.undecided,
    low: palette.explained,
  };
  const tip = tooltipStyle(palette);

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-2">
      <section>
        <SectionHeading>Exceptions by reason</SectionHeading>
        <Card className="mt-3 p-4">
          {byType.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">
              No exceptions in this run.
            </p>
          ) : (
            /* Height scales with the number of bars so the labels never
               collide; a fixed height silently squeezes them at eight types. */
            <ResponsiveContainer width="100%" height={Math.max(160, byType.length * 34 + 30)}>
              <BarChart data={[...byType]} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={palette.rule} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: palette.inkMuted, fontSize: 11 }}
                  stroke={palette.rule}
                />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={150}
                  tick={{ fill: palette.inkMuted, fontSize: 10 }}
                  stroke={palette.rule}
                />
                <Tooltip {...tip} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {byType.map((datum) => (
                    <Cell key={datum.type} fill={severityColour[datum.severity]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Bar colour is the severity, the same encoding the queue uses. Colour is never the only
            cue — the count and the type name carry it too.
          </p>
        </Card>
      </section>

      <section>
        <SectionHeading>Match rate by run</SectionHeading>
        <Card className="mt-3 p-4">
          {trend.length < 2 ? (
            <p className="py-10 text-center text-sm text-ink-muted">
              {trend.length === 1
                ? 'One run so far. A trend needs a second.'
                : 'No runs yet.'}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={[...trend]} margin={{ left: -18, right: 12, top: 6 }}>
                <CartesianGrid stroke={palette.rule} />
                <XAxis dataKey="label" tick={{ fill: palette.inkMuted, fontSize: 10 }} stroke={palette.rule} />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: palette.inkMuted, fontSize: 11 }}
                  stroke={palette.rule}
                />
                <Tooltip {...tip} cursor={{ stroke: palette.rule }} />
                <Line
                  type="monotone"
                  dataKey="matchRate"
                  stroke={palette.settled}
                  strokeWidth={2}
                  dot={{ r: 3, fill: palette.settled, stroke: palette.settled }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            One point per run of this dataset, in the order they happened — not a calendar. There is
            no synthetic history here.
          </p>
        </Card>
      </section>

      <section className="xl:col-span-2">
        <SectionHeading>Extraction confidence</SectionHeading>
        <Card className="mt-3 p-4">
          {confidence.length === 0 ? (
            <EmptyState title="Nothing extracted in this dataset.">
              This chart fills in once a PDF or photograph has been read by the model. A dataset
              loaded from CSV has no confidence to report, because nothing was inferred.
            </EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={[...confidence]} margin={{ left: -20, right: 12, top: 6 }}>
                <CartesianGrid vertical={false} stroke={palette.rule} />
                <XAxis dataKey="bucket" tick={{ fill: palette.inkMuted, fontSize: 10 }} stroke={palette.rule} />
                <YAxis allowDecimals={false} tick={{ fill: palette.inkMuted, fontSize: 11 }} stroke={palette.rule} />
                <Tooltip {...tip} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {confidence.map((datum) => (
                    <Cell
                      key={datum.bucket}
                      fill={datum.belowThreshold ? palette.unaccounted : palette.settled}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Amber buckets fall below the 0.85 gate and were held back for review rather than written
            to the ledger. The shape of this distribution is the argument for gating at all: a model
            with flat confidence could not be gated, however accurate it was.
          </p>
        </Card>
      </section>
    </div>
  );
}
