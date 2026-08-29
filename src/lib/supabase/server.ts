/**
 * Server-side Supabase client.
 *
 * Used from Server Components, Route Handlers, and Server Actions. Binds to the
 * request's cookies so every query runs as the signed-in user and is therefore
 * evaluated against their Row-Level Security policies.
 *
 * There is no service-role variant here, deliberately. That key bypasses RLS
 * entirely; not having it in the codebase means it cannot be reached for by
 * accident when a query is inconvenient.
 *
 * @module
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublishableKey, supabaseUrl } from './env';

/**
 * Creates a Supabase client bound to the current request's session.
 *
 * @returns A client whose queries execute as the signed-in user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. This is expected and safe:
          // the middleware refreshes the session on every request, so a token
          // that could not be written here is written there instead.
        }
      },
    },
  });
}

/**
 * Returns the signed-in user, or `null`.
 *
 * Uses `getUser()` rather than `getSession()`: the former revalidates the token
 * with the auth server, whereas the latter trusts a cookie the client could
 * have tampered with. For anything gating access, the difference matters.
 *
 * @returns The authenticated user, or `null` when not signed in.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
