/**
 * Tests for the model-route rate limiter.
 *
 * The limiter is the only thing standing between a runaway client and a real
 * bill, and its logic is entirely edge cases: the boundary at exactly `max`,
 * the window rolling over, and one user's budget not touching another's. All
 * three fail silently in production — the first as an unexpected charge, the
 * last as a user being refused for someone else's traffic.
 *
 * Time is faked rather than slept through, so the window-expiry case runs in
 * microseconds instead of a minute.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consume, LIMITS } from './rate-limit';

describe('consume', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fresh user id per test, since the limiter's state is module-scoped. */
  const userId = (): string => `user-${Math.random().toString(36).slice(2)}`;

  it('allows exactly the budget and refuses the next call', () => {
    const id = userId();
    for (let call = 0; call < LIMITS.ask.max; call += 1) {
      expect(consume('ask', id).allowed).toBe(true);
    }
    expect(consume('ask', id).allowed).toBe(false);
  });

  it('counts down the remaining budget', () => {
    const id = userId();
    expect(consume('ask', id).remaining).toBe(LIMITS.ask.max - 1);
    expect(consume('ask', id).remaining).toBe(LIMITS.ask.max - 2);
  });

  it('restores the full budget once the window has passed', () => {
    const id = userId();
    for (let call = 0; call <= LIMITS.ask.max; call += 1) consume('ask', id);
    expect(consume('ask', id).allowed).toBe(false);

    vi.advanceTimersByTime(LIMITS.ask.windowMs);
    const afterReset = consume('ask', id);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(LIMITS.ask.max - 1);
  });

  it('does not reset the window while a refused caller keeps trying', () => {
    const id = userId();
    for (let call = 0; call <= LIMITS.ask.max; call += 1) consume('ask', id);

    // Halfway through the window, still hammering.
    vi.advanceTimersByTime(LIMITS.ask.windowMs / 2);
    expect(consume('ask', id).allowed).toBe(false);

    // The window ends when it was always going to end, not half a window after
    // the last refusal.
    vi.advanceTimersByTime(LIMITS.ask.windowMs / 2);
    expect(consume('ask', id).allowed).toBe(true);
  });

  it('keeps each user and each budget separate', () => {
    const a = userId();
    const b = userId();
    for (let call = 0; call <= LIMITS.ask.max; call += 1) consume('ask', a);

    expect(consume('ask', a).allowed).toBe(false);
    // A different user is untouched by the first one's traffic.
    expect(consume('ask', b).allowed).toBe(true);
    // And the same user's other budget is a separate bucket.
    expect(consume('extract', a).allowed).toBe(true);
  });

  it('reports a retry delay inside the window', () => {
    const id = userId();
    const result = consume('ask', id);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(LIMITS.ask.windowMs / 1000);
  });
});
