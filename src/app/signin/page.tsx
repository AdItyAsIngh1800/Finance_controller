'use client';

/**
 * Sign-in screen (docs/DESIGN.md §S-1).
 *
 * Two paths. Google OAuth is the primary one — one click, no credentials to
 * invent. Email and password exists alongside it so the application can be
 * used without a Google account, and so more than one account can be created
 * on demand, which is what the row-level-security isolation test requires.
 *
 * Both paths produce an ordinary Supabase session, so everything downstream —
 * middleware, RLS, `getCurrentUser()` — behaves identically regardless of how
 * the user arrived.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Supabase's default minimum. Checked here so the failure is immediate. */
const MIN_PASSWORD_LENGTH = 6;

/** Which credential action the form performs. */
type Mode = 'signIn' | 'signUp';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/datasets';

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<'google' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Only same-origin relative paths, so `next` cannot become an open redirect. */
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/datasets';

  const signInWithGoogle = async (): Promise<void> => {
    setPending('google');
    setError(null);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
    if (oauthError !== null) {
      // Almost always means the Google provider is not enabled in Supabase.
      // Surfaced rather than swallowed, because a silent failure here is very
      // hard to diagnose.
      setError(oauthError.message);
      setPending(null);
    }
  };

  const submitCredentials = async (): Promise<void> => {
    setError(null);
    setNotice(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setPending('password');
    const supabase = createClient();

    if (mode === 'signUp') {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError !== null) {
        setError(signUpError.message);
        setPending(null);
        return;
      }
      // With email confirmation enabled, sign-up succeeds but returns no
      // session. Saying so plainly beats a redirect to a page that bounces
      // straight back to sign-in.
      if (data.session === null) {
        setNotice(
          'Account created. Confirm the address from the email Supabase sent, then sign in. ' +
            'To skip this step, turn off "Confirm email" under Authentication → Providers → Email.',
        );
        setMode('signIn');
        setPending(null);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError !== null) {
        setError(signInError.message);
        setPending(null);
        return;
      }
    }

    // The server needs to observe the new session cookie before the destination
    // renders, so refresh precedes navigation.
    router.refresh();
    router.push(safeNext);
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">AI Finance Controller</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Reconciles processor and bank records against your ledger, and explains every discrepancy
        it finds.
      </p>

      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={pending !== null}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-sm border border-rule bg-paper px-4 py-2.5 text-sm font-medium transition hover:bg-paper-sunk disabled:cursor-not-allowed disabled:opacity-60"
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
        {pending === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-rule" />
        <span className="text-xs text-ink-faint">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitCredentials();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Password</span>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={pending !== null}
          className="w-full rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
        >
          {pending === 'password'
            ? 'Working…'
            : mode === 'signUp'
              ? 'Create account'
              : 'Sign in'}
        </button>
      </form>

      <p className="mt-3 text-xs text-ink-muted">
        {mode === 'signUp' ? 'Already have an account?' : 'No account yet?'}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signUp' ? 'signIn' : 'signUp');
            setError(null);
            setNotice(null);
          }}
          className="underline underline-offset-2 hover:text-ink"
        >
          {mode === 'signUp' ? 'Sign in instead' : 'Create one'}
        </button>
      </p>

      {notice !== null && (
        <p className="mt-4 border-l-2 border-undecided bg-undecided-wash px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {error !== null && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-unaccounted bg-unaccounted-wash px-3 py-2 text-sm text-unaccounted"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      {/* useSearchParams needs a Suspense boundary during prerendering. */}
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
