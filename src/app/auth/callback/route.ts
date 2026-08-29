/**
 * OAuth callback handler.
 *
 * Google redirects here with a one-time code, which is exchanged for a session
 * and written to cookies.
 *
 * @module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Paths the `next` parameter is allowed to send a user to. */
function safeRedirectPath(next: string | null): string {
  // Only same-origin relative paths. Without this check the `next` parameter is
  // an open redirect: an attacker could send a victim to a sign-in link that
  // bounces them to an external site carrying the appearance of legitimacy.
  if (next === null || !next.startsWith('/') || next.startsWith('//')) return '/datasets';
  return next;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'));

  if (code === null) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
