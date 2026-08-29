/**
 * Validated Supabase environment configuration.
 *
 * Reading these through a checked accessor rather than inlining
 * `process.env.X!` means a missing variable fails at startup with a message
 * naming the variable, instead of surfacing later as an opaque "Invalid API
 * key" from the Supabase client.
 *
 * @module
 */

/**
 * Reads a required environment variable.
 *
 * @param name - The variable to read.
 * @returns Its value.
 * @throws {Error} If unset or empty, naming the variable and where to set it.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * The Supabase project URL.
 *
 * Safe to expose: it identifies the project but grants nothing on its own.
 */
export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL');
}

/**
 * The publishable key used by both browser and server clients.
 *
 * This ships to the browser, and that is safe **only** because Row-Level
 * Security is enabled on every user-scoped table. The key grants no access of
 * its own; every query is still evaluated against the signed-in user's policies.
 *
 * @see supabase/migrations — the policies this safety depends on
 */
export function supabasePublishableKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}
