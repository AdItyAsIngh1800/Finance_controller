/**
 * Browser-side Supabase client.
 *
 * Used from Client Components only. Reads the session from cookies written by
 * the server client, so the browser and server agree on who is signed in.
 *
 * @module
 */

import { createBrowserClient } from '@supabase/ssr';
import { supabasePublishableKey, supabaseUrl } from './env';

/**
 * Creates a Supabase client for use in the browser.
 *
 * @returns A client bound to the current user's session.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
