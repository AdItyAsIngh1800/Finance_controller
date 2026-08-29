import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
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
 * @see docs/DESIGN.md §2 — visual language
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

export const metadata: Metadata = {
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
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
