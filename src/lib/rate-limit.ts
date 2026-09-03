/**
 * Per-user rate limiting for the model-backed routes.
 *
 * Extraction and Q&A are the only two paths that spend money on someone else's
 * infrastructure, and both are reachable by any signed-in user as fast as they
 * can hold a key down. Neither had a ceiling before 3 September 2026.
 *
 * **Deliberate simplification, with a named ceiling.** State lives in this
 * process's memory. On Vercel that means the window is per-instance, so N warm
 * instances permit N times the stated budget, and a cold start forgets
 * everything. That is accepted here because the threat being defended against
 * is an accidental loop or an enthusiastic demo, not a determined attacker —
 * and because the alternative is a Redis dependency and an external service on
 * the day before submission. The upgrade path is a shared store keyed the same
 * way: swap the Map for Upstash and every call site is unchanged.
 *
 * Keyed by user id, never by IP. An IP is shared by everyone behind one office
 * NAT, so an IP budget punishes the wrong people; the routes are authenticated
 * anyway, so the better key is always available.
 *
 * @module
 */

/** One user's usage inside the current window. */
interface Window {
  /** When the current window began, in epoch milliseconds. */
  readonly startedAt: number;
  /** Calls made since then. */
  readonly count: number;
}

/**
 * Budgets, per user, per window.
 *
 * Extraction is the expensive one — a multimodal call over a whole document —
 * so it gets the tighter budget. Asking is cheap by comparison and is the
 * interactive path a reviewer will actually exercise during a demo, so its
 * limit is set well above what a person can type.
 */
export const LIMITS = {
  extract: { max: 12, windowMs: 60_000 },
  ask: { max: 30, windowMs: 60_000 },
} as const;

/** Which budget a caller is drawing from. */
export type LimitName = keyof typeof LIMITS;

/**
 * The windows, keyed `<limit>:<userId>`.
 *
 * Module scope, so it survives between requests within one instance. Entries
 * are evicted lazily on read rather than by a timer: a `setInterval` in a
 * serverless function keeps the instance alive and is billed for the privilege.
 */
const windows = new Map<string, Window>();

/** What a caller learns about its own budget. */
export interface RateLimitResult {
  readonly allowed: boolean;
  /** Calls left in this window after the current one. */
  readonly remaining: number;
  /** Seconds until the window resets — the `Retry-After` value. */
  readonly retryAfterSeconds: number;
}

/**
 * Records one call against a user's budget and says whether it may proceed.
 *
 * Counts the call it is refusing as well as the ones it allows, which is
 * deliberate: a caller hammering a refused endpoint should not have its window
 * reset by the refusals.
 *
 * @param name - Which budget to draw from.
 * @param userId - The signed-in user. Callers must have authenticated first;
 *   an unauthenticated route has nothing meaningful to key on.
 * @returns Whether to proceed, and what to tell the caller if not.
 */
export function consume(name: LimitName, userId: string): RateLimitResult {
  const { max, windowMs } = LIMITS[name];
  const key = `${name}:${userId}`;
  const now = Date.now();
  const existing = windows.get(key);

  // A window that has run out is replaced rather than extended, so a user who
  // came back after a pause starts with a full budget.
  const current: Window =
    existing === undefined || now - existing.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : existing;

  const count = current.count + 1;
  windows.set(key, { startedAt: current.startedAt, count });

  // Opportunistic eviction: bounded work, and it keeps a long-lived instance
  // from holding a window for every user who ever called it.
  if (windows.size > 5_000) {
    for (const [otherKey, window] of windows) {
      if (now - window.startedAt >= windowMs) windows.delete(otherKey);
    }
  }

  const elapsed = now - current.startedAt;
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
  };
}
