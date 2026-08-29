import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/**
 * Root layout.
 *
 * Two font families are loaded deliberately: a proportional sans for interface
 * chrome, and a monospace with tabular figures for every monetary and reference
 * value. Column-aligned digits are how a finance user scans a reconciliation
 * table for anomalies, so the monospace face is load-bearing rather than
 * decorative.
 *
 * @see docs/DESIGN.md §2 — visual language
 */

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
