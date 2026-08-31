/**
 * Validated Supabase environment configuration.
 *
 * **Each variable is read by static member access, never by computed index.**
 * That is not a style preference. Next.js makes `NEXT_PUBLIC_*` values
 * available in the browser by textually substituting occurrences of
 * `process.env.NEXT_PUBLIC_FOO` at build time; a dynamic lookup like
 * `process.env[name]` is invisible to that transform, so the value is inlined
 * nowhere and resolves to `undefined` in the browser while continuing to work
 * perfectly on the server.
 *
 * That asymmetry is what makes the mistake expensive: server-rendered pages,
 * route handlers, and anything tested with `curl` all behave correctly, and the
 * failure appears only when a Client Component tries to construct a Supabase
 * client. It did exactly that here, and went unnoticed from Phase 4 until the
 * first real sign-in attempt.
 *
 * Reading through a checked accessor also means a missing variable fails with a
 * message naming it, rather than surfacing later as an opaque "Invalid API key"
 * from the Supabase client.
 *
 * @module
 */

/**
 * Returns a required environment value, or explains what is missing.
 *
 * @param name - The variable's name, for the error message only.
 * @param value - The value, read by the caller via static member access.
 * @returns The value.
 * @throws {Error} If unset or empty.
 */
function requireValue(name: string, value: string | undefined): string {
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
  return requireValue('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
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
  return requireValue(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
