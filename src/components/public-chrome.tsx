/**
 * Header and footer for the signed-out surface.
 *
 * Separate from `AppHeader`, which carries signed-in navigation (Datasets, the
 * account address, sign-out) and would be wrong here: a visitor with no account
 * offered a "Datasets" link gets a redirect back to sign-in, which reads as a
 * broken link rather than as a gate.
 *
 * @see docs/DESIGN.md §S-0
 */

import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import { Mark } from './ui';

/**
 * Top bar for public pages.
 *
 * The accuracy report is in the bar rather than only at the foot of the page:
 * it answers the question a reviewer arrives with, and burying it below a
 * scroll meant most visitors never learned it existed.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-page/85 backdrop-blur-md">
      {/*
        Wraps rather than overflows. Four links plus the theme control exceed a
        320px viewport, and before this the whole page scrolled sideways by 72px
        — the bar simply pushed past the edge. Wrapping costs a second row on a
        narrow phone and keeps every destination reachable, which is the better
        trade than hiding links that only exist to be found.
      */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 sm:flex-nowrap sm:gap-x-3 sm:py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-control transition-opacity duration-150 ease-ui hover:opacity-80 sm:gap-2.5"
        >
          <Mark />
          {/*
            Visually dropped below 360px so the nav links and the theme control
            still fit — but `sr-only`, not `hidden`. The mark beside it is
            decorative and `aria-hidden`, so `display: none` here left the link
            with no accessible name at all: axe reports `link-name` at 320px, and
            a screen reader announces an unlabelled link to the home page.
          */}
          <span className="sr-only whitespace-nowrap text-sm font-semibold tracking-tight min-[360px]:not-sr-only min-[360px]:inline">
            Finance Controller
          </span>
        </Link>

        <nav aria-label="Main" className="order-3 -ml-1.5 flex w-full flex-wrap items-center gap-0.5 sm:order-none sm:ml-auto sm:w-auto sm:flex-nowrap sm:shrink-0 sm:gap-1">
          <PublicNavLink href="/#how-it-works">How it works</PublicNavLink>
          <PublicNavLink href="/docs">Docs</PublicNavLink>
          <PublicNavLink href="/formats">Formats</PublicNavLink>
          <PublicNavLink href="/evaluation">Accuracy</PublicNavLink>
          <PublicNavLink href="/signin">Sign in</PublicNavLink>
        </nav>

        <span aria-hidden="true" className="hidden h-5 w-px bg-rule sm:block" />
        <span className="ml-auto sm:ml-0">
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

/** One item of the public navigation. */
function PublicNavLink({ href, children }: { readonly href: string; readonly children: string }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-control px-1.5 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 ease-ui hover:bg-paper-sunk hover:text-ink sm:px-2.5 sm:text-sm"
    >
      {children}
    </Link>
  );
}

/**
 * Foot of the public pages.
 *
 * Deliberately plain: an author line, the source, and the two links that matter.
 * A submission with no visible author reads as unfinished, and a reviewer who
 * wants to check the engine should not have to guess where it lives.
 */
export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          AI Finance Controller — built by Aditya Singh for the 2026 buildathon, Track 04.
        </p>
        {/* No source link: the repository is private, so it 404s for everyone
            but the owner, and a footer link that fails is worse than an absent
            one. Restore it if the repository is ever made public. */}
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <FooterLink href="/formats">What it reads</FooterLink>
          <FooterLink href="/docs">How matching works</FooterLink>
          <FooterLink href="/evaluation">Accuracy report</FooterLink>
        </nav>
      </div>
    </footer>
  );
}

/** One footer link. External destinations open in the same tab, as links do. */
function FooterLink({ href, children }: { readonly href: string; readonly children: string }) {
  return (
    <Link
      href={href}
      className="rounded-sm text-ink-muted underline underline-offset-2 transition-colors duration-150 ease-ui hover:text-ink"
    >
      {children}
    </Link>
  );
}
