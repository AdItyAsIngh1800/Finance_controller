/**
 * Application chrome — the bar every signed-in screen carries.
 *
 * Before this existed each screen rolled its own heading and sign-out control,
 * so the product had no fixed point: which page you were on changed where
 * navigation lived. One bar, in the same place, on every screen.
 *
 * It is a Server Component and takes the signed-in address as a prop rather
 * than fetching it. `getCurrentUser()` revalidates the token with the auth
 * server on every call, so having the header call it too would add a network
 * round-trip to each page purely to render an address the page already had.
 *
 * @see docs/DESIGN.md §2
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';
import { Mark } from './ui';

/** One step in a {@link Breadcrumb}. */
export interface Crumb {
  /** Text shown for this step. */
  readonly label: string;
  /** Destination; omitted for the current page, which is not a link. */
  readonly href?: string;
}

/**
 * The top bar.
 *
 * Sticky, so navigation stays reachable while a reviewer works down a long
 * exception queue. `backdrop-blur` keeps the rules of the table beneath it
 * faintly visible, which reads as a pane over the page rather than a lid on it.
 *
 * @param props.email - Address of the signed-in user, shown from `sm` up. On a
 *   phone the width is worth more than the reminder.
 */
export function AppHeader({ email }: { readonly email?: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-page/85 backdrop-blur-md">
      {/* Gaps and control padding tighten on a phone: at 390px the wordmark,
          both nav links and the sign-out control together exceed the viewport
          at desktop spacing, and pushing the last one off-screen is worse than
          sitting them closer together. */}
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link
          href="/datasets"
          className="group flex shrink-0 items-center gap-2 rounded-control transition-opacity duration-150 ease-ui hover:opacity-80 sm:gap-2.5"
        >
          <Mark />
          {/*
            Never wraps, and disappears entirely below 360px.

            The bar carries the wordmark, two nav links and sign-out; at 320px
            those together exceed the viewport and the last one would be pushed
            off-screen. The mark stays, so the bar is still identifiably the
            product — dropping a word beats dropping a control. Above 360px,
            which covers every current phone, the wordmark is present.
          */}
          <span className="hidden whitespace-nowrap text-sm font-semibold tracking-tight min-[360px]:inline">
            Finance Controller
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <NavLink href="/datasets">Datasets</NavLink>
          <NavLink href="/evaluation">Accuracy</NavLink>
        </nav>

        {email !== undefined && email !== null && (
          <>
            <span aria-hidden="true" className="hidden h-5 w-px bg-rule sm:block" />
            <span className="hidden max-w-[14rem] truncate text-xs text-ink-muted sm:block">
              {email}
            </span>
          </>
        )}

        <ThemeToggle />

        <form action="/auth/signout" method="post" className="shrink-0">
          <button
            type="submit"
            className="rounded-control px-1.5 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 ease-ui hover:bg-paper-sunk hover:text-ink sm:px-2.5"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

/** One item of the main navigation. */
function NavLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-control px-1.5 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 ease-ui hover:bg-paper-sunk hover:text-ink sm:px-2.5"
    >
      {children}
    </Link>
  );
}

/**
 * The trail back up from the current screen.
 *
 * Rendered as an ordered list inside a labelled `<nav>` rather than as loose
 * spans with slashes, so a screen reader announces it as navigation with a
 * known number of steps. The separators are decorative and hidden from it.
 *
 * The final crumb carries `aria-current="page"` and, being the page you are
 * already on, is not a link.
 */
export function Breadcrumb({ items }: { readonly items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href !== undefined && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-sm underline-offset-2 transition-colors duration-150 ease-ui hover:text-ink hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="max-w-[16rem] truncate text-ink" aria-current="page">
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-ink-faint">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A page title block.
 *
 * @param props.title - The screen's name.
 * @param props.description - Optional one-line explanation beneath it.
 * @param props.actions - Optional controls aligned to the title, wrapping below
 *   it on narrow viewports rather than compressing it.
 */
export function PageHeading({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description !== undefined && (
          <p className="prose-measure mt-1.5 text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
