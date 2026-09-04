/**
 * Shared interface primitives.
 *
 * These exist because the same control was being written out longhand on every
 * screen, and the copies had drifted: buttons carried two different corner
 * radii and three different vertical paddings, and page shells disagreed on
 * their width and top margin. Centralising them is what makes the interface
 * read as one product rather than eight screens built in sequence.
 *
 * Everything here is a Server Component by default — none of it holds state.
 * The interactive screens import these into their own `'use client'` modules,
 * which works because a client boundary is inherited by what it renders.
 *
 * @see docs/DESIGN.md §2 — visual language
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/* ------------------------------------------------------------------ layout */

/**
 * The page shell.
 *
 * One source of truth for page width, gutters and vertical rhythm. Gutters
 * widen with the viewport rather than staying fixed, so a phone gets its screen
 * back and a desktop keeps the content off the window edge.
 *
 * @param props.width - `content` for reading-width screens (lists, the accuracy
 *   report), `wide` for working screens that carry side-by-side panels.
 */
export function PageShell({
  width = 'content',
  children,
}: {
  readonly width?: 'content' | 'wide';
  readonly children: ReactNode;
}) {
  const max = width === 'wide' ? 'max-w-6xl' : 'max-w-4xl';
  return (
    <main className={`mx-auto w-full ${max} px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12`}>
      {children}
    </main>
  );
}

/**
 * A raised panel.
 *
 * The border does the structural work and the shadow only separates the plane;
 * on a screen this dense a heavier shadow repeated down the page becomes noise.
 */
export function Card({
  className = '',
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`rounded-card border border-rule bg-paper-raised shadow-lift-sm ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The product mark: two columns brought to one baseline.
 *
 * Two strokes of unequal height meeting a common rule. It is the most literal
 * statement the product can make about itself — two sides reconciled to a single
 * figure — and it is drawn vertically for a practical reason as much as a
 * semantic one.
 *
 * The mark it replaced was four stacked horizontal bars, which at the 28px it
 * actually renders at was indistinguishable from a hamburger menu. Unequal line
 * lengths were tried first and were far too subtle at that size. Nothing built
 * from horizontal stacks escapes that read; a vertical form does.
 *
 * Stroke weight steps up as the mark gets smaller. A 1.6-unit stroke on a 16
 * unit grid is correct at 96px and disappears in a browser tab, so the favicon
 * size gets a heavier one. Optical correction, not a bug.
 *
 * Brass plate with the glyph cut out of it, in both themes, via `--brand-mark`
 * and `--brand-ground`, which deliberately do not flip. A logo that inverts is
 * two logos.
 *
 * `aria-hidden` because the wordmark beside it carries the name.
 *
 * @param props.size - `sm` for a navigation bar, `md` where the mark opens a
 *   page beside the wordmark at heading weight.
 */
export function Mark({ size = 'sm' }: { readonly size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9' : 'h-7 w-7';
  const glyph = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  // Heavier at the small size, so the columns still read in a browser tab.
  const column = size === 'md' ? 1.7 : 2;
  const rule = size === 'md' ? 1.7 : 2;
  return (
    <span
      aria-hidden="true"
      className={`flex ${box} shrink-0 items-center justify-center rounded-control bg-brand-mark text-brand-ground`}
    >
      <svg viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor">
        {/* The two sides. Unequal on purpose: they are not the same figure until
            the engine has said so. */}
        <path d="M5.25 3.25v7.75M10.75 5.75v5.25" strokeWidth={column} strokeLinecap="round" />
        {/* The baseline they are brought to. */}
        <path d="M2.75 12.9h10.5" strokeWidth={rule} strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * A horizontally scrolling wrapper for a wide table.
 *
 * Every dense table in this interface is wider than a phone and scrolls inside
 * its card rather than reflowing — five numeric columns mean nothing apart from
 * each other. That scrolling brings two requirements a plain `overflow-x-auto`
 * div does not satisfy, and both were found by running axe at 320px:
 *
 * - **`tabIndex={0}`.** A scrollable region has to be reachable by keyboard, or
 *   someone not using a pointer cannot see the columns that are off-screen.
 *   `role="region"` plus a label is what makes that stop instead of an
 *   unexplained tab stop.
 * - **`relative`.** Tailwind's `sr-only` is `position: absolute`, and an
 *   absolutely-positioned element is clipped by an ancestor's overflow only
 *   when that ancestor is its containing block. Without this the screen-reader
 *   labels inside table buttons escape the clip and scroll the whole document
 *   sideways.
 *
 * @param props.label - Names the region for assistive technology. Say what the
 *   table contains, not that it scrolls.
 */
export function TableScroller({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
    >
      {children}
    </div>
  );
}

/**
 * A section heading with its rule.
 *
 * @param props.trailing - Optional right-aligned content, such as a count or a
 *   filter group, kept on the heading's baseline.
 */
export function SectionHeading({
  children,
  trailing,
  className = '',
}: {
  readonly children: ReactNode;
  readonly trailing?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-rule-strong pb-2 ${className}`}
    >
      <h2 className="eyebrow">{children}</h2>
      {trailing}
    </div>
  );
}

/* ---------------------------------------------------------------- controls */

/** Visual weight of a {@link Button}. */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

/** Which size a {@link Button} renders at. */
export type ButtonSize = 'sm' | 'md';

/**
 * Shared button geometry.
 *
 * `active:translate-y-px` is the whole of the press feedback — a single pixel,
 * enough to feel connected to the pointer, too small to delay a reading.
 */
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,opacity,translate] duration-150 ease-ui ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-40';

/** Per-variant colour. */
const BUTTON_VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  /*
   * Brass, because the primary action is what the palette calls an important
   * CTA. `text-page` rather than a fixed dark: the accent darkens in the light
   * theme, so a hard-coded Midnight Ink label would be dark-on-dark there.
   * Against the page token it measures 7.67:1 in dark and 5.68:1 in light.
   */
  primary: 'bg-accent-strong text-page shadow-lift-sm hover:opacity-90 hover:shadow-lift-md',
  secondary: 'border border-rule bg-paper-raised text-ink shadow-lift-sm hover:border-rule-strong hover:bg-paper-sunk',
  quiet: 'text-ink-muted hover:bg-paper-sunk hover:text-ink',
  danger: 'border border-unaccounted text-unaccounted hover:bg-unaccounted-wash',
};

/** Per-size padding. */
const BUTTON_SIZES: Readonly<Record<ButtonSize, string>> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

/**
 * Composes the class list for a button's appearance.
 *
 * Exported so a `<Link>` can wear the same appearance without being wrapped in
 * a `<button>`. Nesting the two produces invalid markup and gives assistive
 * technology two conflicting roles for one control, so a navigation that looks
 * like a button must *be* an anchor.
 *
 * @param variant - Visual weight.
 * @param size - Control size.
 * @param className - Extra classes appended last so they win.
 * @returns The composed class string.
 */
export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;
}

/** Props for {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

/**
 * A button.
 *
 * Deliberately a plain `<button>` with composed classes rather than a styled
 * wrapper: every native attribute — `type`, `form`, `disabled`, `aria-*` —
 * passes straight through, so nothing has to be re-exposed as a prop.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}

/**
 * Geometry and focus treatment shared by every text-entry control.
 *
 * A field is a *sunk* plane, not a raised one. It used to sit on
 * `--paper-raised` with a hairline, which on the old near-white palette read as
 * an outline drawn on the card; on Midnight Ink it read as another panel. Sunk
 * inverts the elevation so the control looks like a slot cut into the card —
 * somewhere to put something — which is what makes a form scannable before any
 * label is read.
 *
 * Focus lifts the border to brass rather than growing a ring: the global
 * `:focus-visible` outline in `globals.css` already provides the accessible
 * indicator, and two competing focus treatments on one control is noise.
 */
const FIELD_BASE =
  'w-full rounded-control border border-rule bg-paper-sunk px-3 py-2.5 text-sm text-ink ' +
  'transition-[border-color,background-color] duration-150 ease-ui ' +
  'placeholder:text-ink-faint hover:border-rule-strong focus:border-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/**
 * A labelled text input.
 *
 * The label is a real `<label>` wrapping the control, so the hit area includes
 * the text and no `htmlFor`/`id` pair can fall out of sync.
 *
 * @param props.label - Visible label text.
 * @param props.hint - Optional helper line under the control.
 */
export function Field({
  label,
  hint,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly hint?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      <input className={FIELD_BASE} {...rest} />
      {hint !== undefined && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

/**
 * A labelled select.
 *
 * `appearance-none` plus a background chevron, because the native control
 * renders at a different height on every platform and would break the row it
 * sits in.
 */
export function SelectField({
  label,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { readonly label: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      <select className={`${FIELD_BASE} select-chevron cursor-pointer appearance-none pr-9`} {...rest}>
        {children}
      </select>
    </label>
  );
}

/**
 * A compact select for filter bars.
 *
 * Same control as {@link SelectField} at toolbar scale, with the label inline
 * rather than stacked above.
 */
export function InlineSelect({
  label,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { readonly label: string }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-ink-muted">{label}</span>
      <select
        className={`cursor-pointer appearance-none rounded-control border border-rule bg-paper-raised py-1.5 pl-2.5 pr-8 text-xs text-ink shadow-lift-sm transition-colors duration-150 ease-ui hover:border-rule-strong select-chevron`}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ notices */

/** What a {@link Notice} is telling the reader. */
export type NoticeTone = 'error' | 'warning' | 'success' | 'neutral';

/** Border and wash per tone, keyed to the same palette severity uses. */
const NOTICE_TONES: Readonly<Record<NoticeTone, string>> = {
  error: 'border-unaccounted/40 bg-unaccounted-wash text-unaccounted',
  warning: 'border-undecided/40 bg-undecided-wash text-ink',
  success: 'border-settled/30 bg-settled-wash text-ink',
  neutral: 'border-rule bg-paper-sunk text-ink',
};

/**
 * An inline message.
 *
 * Errors carry `role="alert"` so a screen reader announces them when they
 * appear; the other tones do not, because interrupting a reader to announce a
 * success they already caused is noise.
 *
 * @param props.tone - Which meaning the message carries.
 */
export function Notice({
  tone = 'neutral',
  className = '',
  children,
}: {
  readonly tone?: NoticeTone;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      {...(tone === 'error' ? { role: 'alert' as const } : {})}
      className={`rounded-control border-l-2 px-3.5 py-2.5 text-sm leading-relaxed ${NOTICE_TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * An empty or success state.
 *
 * Never a bare "no data": the title says what happened and the body says what
 * would fill the screen, per docs/DESIGN.md §5.
 *
 * @param props.action - Optional control that produces the missing content.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-rule-strong bg-paper/60 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="prose-measure mx-auto mt-1.5 text-sm text-ink-muted">{children}</p>
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
