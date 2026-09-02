'use client';

/**
 * Signed-in navigation: a sidebar on desktop, a disclosure on a phone.
 *
 * Replaces the single top bar on 3 September 2026. The top bar held two links
 * and could not hold more; the four destinations below are the shape a finance
 * tool is expected to have, and matching that expectation is worth more here
 * than the horizontal space the bar saved.
 *
 * Below `lg` the rail collapses to a button that opens the same list beneath
 * the bar. A drawer that overlays the page was considered and rejected: it
 * needs a focus trap, a scroll lock and an escape handler to be correct, and a
 * disclosure that pushes content down needs none of them.
 *
 * @see docs/DESIGN.md §S-9
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';
import { Mark } from './ui';

/** One destination. */
interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
}

const ICON = 'h-4 w-4 shrink-0';

/**
 * The four destinations.
 *
 * "Reconciliations" and "Exceptions" are cross-dataset views: until now both
 * only existed inside a single run, which meant a reviewer with four datasets
 * had no way to see the work waiting for them without opening each in turn.
 */
const NAV: readonly NavItem[] = [
  {
    href: '/datasets',
    label: 'Overview',
    icon: (
      <svg viewBox="0 0 20 20" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3.5 3.5h6v5h-6zM10.5 3.5h6v9h-6zM3.5 9.5h6v7h-6zM10.5 13.5h6v3h-6z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/reconciliations',
    label: 'Reconciliations',
    icon: (
      <svg viewBox="0 0 20 20" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 6.5h4.5a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2H17M3 13.5h4.5a2 2 0 0 0 2-2v-3a2 2 0 0 1 2-2H17" strokeLinecap="round" />
        <path d="M14.5 4.5 17 6.5l-2.5 2M14.5 11.5 17 13.5l-2.5 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/exceptions',
    label: 'Exceptions',
    icon: (
      <svg viewBox="0 0 20 20" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3.5 17 16h-14z" strokeLinejoin="round" />
        <path d="M10 8v3.5M10 13.6v.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 20 20" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

/**
 * The signed-in shell.
 *
 * @param props.email - The signed-in address, shown so a reviewer can tell
 *   which account they are looking at. Absent when unknown.
 * @param props.children - The page content, rendered in the main column.
 */
export function AppShell({
  email,
  children,
}: {
  readonly email?: string | null;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:flex lg:min-h-screen">
      {/* Mobile bar. Carries the mark, the disclosure and the theme control. */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-rule bg-page/90 px-3 py-2.5 backdrop-blur-md lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-control px-2 py-1.5 text-ink-muted transition-colors duration-150 ease-ui hover:bg-paper-sunk hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3.5 6h13M3.5 10h13M3.5 14h13" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-medium">Menu</span>
        </button>
        <Link href="/datasets" className="ml-auto flex items-center gap-2 rounded-control">
          <Mark />
          <span className="text-sm font-semibold tracking-tight">Finance Controller</span>
        </Link>
        <ThemeToggle />
      </div>

      {/*
        One list, two presentations. Rendering it once and restyling by
        breakpoint keeps the active-state logic in a single place; two copies
        drifted the moment a link was added in the old top bar.
      */}
      <nav
        id="app-nav"
        aria-label="Main"
        className={`${open ? 'block' : 'hidden'} border-b border-rule bg-paper px-3 py-3 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-3 lg:py-4`}
      >
        <Link
          href="/datasets"
          className="mb-4 hidden items-center gap-2.5 rounded-control px-2 transition-opacity duration-150 ease-ui hover:opacity-80 lg:flex"
        >
          <Mark />
          <span className="text-sm font-semibold tracking-tight">Finance Controller</span>
        </Link>

        <ul className="space-y-0.5">
          {NAV.map((item) => {
            // `/datasets/abc` keeps Overview lit; an exact match would leave the
            // sidebar with nothing active on every detail screen.
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors duration-150 ease-ui ${
                    active
                      ? 'bg-paper-sunk font-medium text-ink'
                      : 'text-ink-muted hover:bg-paper-sunk hover:text-ink'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 border-t border-rule pt-3 lg:absolute lg:bottom-4 lg:w-[12.5rem]">
          {email !== undefined && email !== null && (
            <p className="truncate px-2.5 pb-2 text-xs text-ink-muted" title={email}>
              {email}
            </p>
          )}
          <div className="flex items-center gap-1 px-1">
            <form action="/auth/signout" method="post" className="flex-1">
              <button
                type="submit"
                className="w-full rounded-control px-1.5 py-1.5 text-left text-xs text-ink-muted transition-colors duration-150 ease-ui hover:bg-paper-sunk hover:text-ink"
              >
                Sign out
              </button>
            </form>
            <span className="hidden lg:block">
              <ThemeToggle />
            </span>
          </div>
        </div>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
