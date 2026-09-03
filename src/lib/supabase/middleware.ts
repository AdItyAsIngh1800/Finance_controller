/**
 * Session refresh and route protection.
 *
 * Runs on every matched request. Two jobs: refresh the auth token so a session
 * does not silently expire mid-use, and redirect unauthenticated traffic away
 * from application routes.
 *
 * The redirect is a convenience, not the security boundary. Row-Level Security
 * is what actually protects the data — a request that slipped past this
 * middleware would still read nothing it does not own.
 *
 * @module
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublishableKey, supabaseUrl } from './env';

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_ROUTES = ['/', '/signin', '/auth', '/evaluation', '/formats', '/opengraph-image'] as const;

/**
 * Is this path publicly reachable?
 *
 * `/evaluation` is deliberately public: it reports accuracy against synthetic
 * ground truth, exposes no user data, and saves a reviewer from having to
 * create an account to see it. `/formats` is public for the same reason — it
 * documents the file shapes the adapters accept and contains nothing but
 * static prose.
 *
 * `/opengraph-image` must be public for a different reason: the client
 * unfurling a shared link is a scraper with no cookies, so gating it means the
 * card never renders for anyone. It is a generated static image containing only
 * the wordmark and a figure already published on `/evaluation`, so there is
 * nothing behind the gate to protect. Found by requesting it on production —
 * the matcher below excludes real image *files*, but this is a route.
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || (route !== '/' && pathname.startsWith(`${route}/`)),
  );
}

/**
 * Refreshes the session and enforces route protection.
 *
 * @param request - The incoming request.
 * @returns The response, with refreshed auth cookies attached.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Cookies are written to both the request and a fresh response so that
        // the refreshed token is visible to this request's handlers as well as
        // being persisted to the browser.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove: this call is what performs the token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null && !isPublicRoute(request.nextUrl.pathname)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/signin';
    // Preserve the destination so sign-in can return the user where they meant
    // to go rather than dumping them on a default page.
    signInUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}
