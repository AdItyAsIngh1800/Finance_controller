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
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-control transition-opacity duration-150 ease-ui hover:opacity-80 sm:gap-2.5"
        >
          <Mark />
          {/* Drops below 360px so the three links and the theme control still
              fit; the mark alone still identifies the product. */}
          <span className="hidden whitespace-nowrap text-sm font-semibold tracking-tight min-[360px]:inline">
            Finance Controller
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <PublicNavLink href="/#how-it-works">How it works</PublicNavLink>
          <PublicNavLink href="/evaluation">Accuracy</PublicNavLink>
          <PublicNavLink href="/signin">Sign in</PublicNavLink>
        </nav>

        <span aria-hidden="true" className="hidden h-5 w-px bg-rule sm:block" />
        <ThemeToggle />
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
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <FooterLink href="https://github.com/AdItyAsIngh1800/Finance_controller">
            Source on GitHub
          </FooterLink>
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
