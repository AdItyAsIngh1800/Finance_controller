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

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button, Card, Field, Mark, Notice } from '@/components/ui';
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
      {/* The wordmark is the way back to the public overview. Someone who
          arrived here from a bookmark or an OAuth bounce has otherwise no route
          to it, and a wordmark that does not go home reads as broken. */}
      <Link href="/" className="flex items-center gap-2.5 rounded-control transition-opacity duration-150 ease-ui hover:opacity-80">
        <Mark size="md" />
        <h1 className="text-xl font-semibold">AI Finance Controller</h1>
      </Link>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Reconciles processor and bank records against your ledger, and explains every discrepancy
        it finds.
      </p>

      {/* A brass rule across the top of the card.
          Asking someone for credentials is the one moment the interface should
          feel deliberate rather than incidental, and a bounded panel with a
          weighted edge reads as an object to act on — where an unbordered form
          floating on the page reads as an afterthought. */}
      <Card className="mt-7 overflow-hidden p-0">
        <div aria-hidden="true" className="h-0.5 w-full bg-accent" />
        <div className="p-5 sm:p-6">
        <Button
          variant="secondary"
          onClick={() => void signInWithGoogle()}
          disabled={pending !== null}
          className="w-full"
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
        </Button>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-rule" />
          <span className="text-[11px] uppercase tracking-wider text-ink-muted">or</span>
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitCredentials();
          }}
          className="space-y-4"
        >
          <Field
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Field
            label="Password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            {...(mode === 'signUp'
              ? { hint: `At least ${MIN_PASSWORD_LENGTH} characters.` }
              : {})}
          />

          <Button type="submit" variant="primary" disabled={pending !== null} className="w-full">
            {pending === 'password'
              ? 'Working…'
              : mode === 'signUp'
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-xs text-ink-muted">
          {mode === 'signUp' ? 'Already have an account?' : 'No account yet?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signUp' ? 'signIn' : 'signUp');
              setError(null);
              setNotice(null);
            }}
            className="rounded-sm font-medium text-ink underline underline-offset-2 transition-opacity duration-150 ease-ui hover:opacity-70"
          >
            {mode === 'signUp' ? 'Sign in instead' : 'Create one'}
          </button>
        </p>
        </div>
      </Card>

      {notice !== null && (
        <Notice tone="warning" className="mt-4">
          {notice}
        </Notice>
      )}

      {error !== null && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}

      <p className="mt-6 text-center text-xs text-ink-muted">
        <Link
          href="/evaluation"
          className="rounded-sm underline underline-offset-2 transition-colors duration-150 ease-ui hover:text-ink"
        >
          See how accurate the engine is
        </Link>{' '}
        — no account needed.
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      {/* No app bar on this screen, so the theme control gets the corner —
          a viewer should not have to sign in to change how the page looks. */}
      <div className="absolute right-3 top-3">
        <ThemeToggle />
      </div>
      {/* useSearchParams needs a Suspense boundary during prerendering. */}
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
