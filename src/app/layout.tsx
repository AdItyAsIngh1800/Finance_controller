import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Space_Grotesk } from 'next/font/google';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * Root layout.
 *
 * Two faces, and only two, since 3 September 2026: Space Grotesk for headings
 * and Inter for everything else, replacing IBM Plex Sans and Plex Mono.
 *
 * The load-bearing property is not the monospace face itself but *column-
 * aligned digits* — a finance user scans a reconciliation table by running an
 * eye down a column, and proportional figures defeat that scan. Inter ships
 * true tabular figures, and `font-variant-numeric: tabular-nums` is set on
 * `body`, so the alignment survives the change.
 *
 * What is lost is the visual signal that a value is a code rather than prose:
 * `--font-mono` now resolves to Inter, so every existing `font-mono` class
 * keeps its tabular alignment but no longer looks typewritten. That is the
 * accepted cost of a two-face system; the token name is kept so the call sites
 * do not all have to change, and so a third face could be reintroduced in one
 * place if the codes turn out to need it.
 *
 * Also carries the theme-resolution script, which must execute before the first
 * paint rather than in a React effect.
 *
 * @see docs/DESIGN.md §2 — visual language, §7.1 — dark theme
 */

const displayFont = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const bodyFont = Inter({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

/**
 * Absolute base for generated metadata URLs.
 *
 * `opengraph-image.tsx` emits a relative path, and a social client resolving
 * `og:image` has no page origin to resolve it against — so without a base the
 * card silently fails to unfurl. Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` to
 * the *stable* production domain on every deployment, preview builds included,
 * which is what is wanted here: a preview's own hashed URL would pin the card
 * to one build that later stops being the current one.
 */
const SITE_URL =
  process.env.VERCEL_PROJECT_PRODUCTION_URL !== undefined
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'AI Finance Controller',
  description:
    'Reconciles processor and bank records against an internal ledger, with a deterministic matching engine and AI confined to document extraction and grounded explanation.',
};

/**
 * Props for {@link RootLayout}.
 *
 * Typed explicitly rather than using Next.js's generated `LayoutProps` global,
 * which only exists once `.next/types` has been produced by a build. Declaring
 * it here keeps `tsc --noEmit` working on a fresh clone.
 */
interface RootLayoutProps {
  /** The routed page content. */
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // `suppressHydrationWarning` is required and is scoped to this one element:
    // the init script sets `data-theme` on <html> before React hydrates, so the
    // server markup (no attribute) and the client DOM (attribute present)
    // legitimately differ. Suppressing it here does not affect any child.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <head>
        {/*
          Resolves the theme before first paint.

          It must run synchronously in <head>, ahead of any markup, or the
          browser paints the light palette and then repaints — the flash of
          wrong theme. Next.js does not defer or reorder a plain inline script
          placed here.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
