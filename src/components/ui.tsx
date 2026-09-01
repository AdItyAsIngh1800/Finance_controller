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
  primary: 'bg-ink text-paper shadow-lift-sm hover:bg-ink/90 hover:shadow-lift-md',
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

/** Geometry and focus treatment shared by every text-entry control. */
const FIELD_BASE =
  'w-full rounded-control border border-rule bg-paper-raised px-3 py-2 text-sm text-ink ' +
  'shadow-lift-sm transition-[border-color,box-shadow] duration-150 ease-ui ' +
  'placeholder:text-ink-faint hover:border-rule-strong ' +
  'disabled:cursor-not-allowed disabled:bg-paper-sunk disabled:opacity-60';

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
      {hint !== undefined && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
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
