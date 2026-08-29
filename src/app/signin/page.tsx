'use client';

/**
 * Sign-in screen (docs/DESIGN.md §S-1).
 *
 * Google OAuth is the only path. There is deliberately no email/password form:
 * no SMTP to configure, no password reset flow to build, and one click for a
 * reviewer who should not have to invent credentials to look at a demo.
 */

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** The sign-in form, split out so it can sit inside a Suspense boundary. */
function SignInForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Starts the Google OAuth flow.
   *
   * The destination the user originally requested is threaded through the
   * callback so they land where they meant to, rather than on a default page.
   */
  const signIn = async (): Promise<void> => {
    setPending(true);
    setError(null);

    const supabase = createClient();
    const next = searchParams.get('next') ?? '/datasets';
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (signInError !== null) {
      // Surfaced rather than swallowed: the overwhelmingly likely cause is that
      // the Google provider has not been enabled in the Supabase dashboard, and
      // a silent failure here would be very hard to diagnose.
      setError(signInError.message);
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">AI Finance Controller</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Reconciles processor and bank records against your ledger, and explains every
        discrepancy it finds.
      </p>

      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-md border border-rule bg-paper px-4 py-2.5 text-sm font-medium transition hover:bg-paper-sunk disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
          />
          <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3h-4a12 12 0 0 0 0 10.7l4-3.1Z" />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
          />
        </svg>
        {pending ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {error !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-unaccounted bg-unaccounted-wash px-3 py-2 text-sm text-unaccounted"
        >
          Could not start sign-in: {error}
        </p>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      {/* useSearchParams requires a Suspense boundary during prerendering. */}
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
