import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * Root layout.
 *
 * IBM Plex, in two roles. Plex was drawn for IBM's engineering and data
 * contexts, which is the register this tool operates in — an instrument rather
 * than a brand. Plex Mono carries every monetary and reference value: column-
 * aligned digits are how a finance user scans a reconciliation table for
 * anomalies, so the monospace face is load-bearing rather than decorative.
 *
 * Also carries the theme-resolution script, which must execute before the first
 * paint rather than in a React effect.
 *
 * @see docs/DESIGN.md §2 — visual language, §7.1 — dark theme
 */

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
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
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
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
