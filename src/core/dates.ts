/**
 * Calendar-date helpers for the reconciliation core.
 *
 * Dates in this system are calendar facts, not instants: a settlement dated
 * 2026-08-14 happened on that day regardless of the reader's timezone. All
 * arithmetic here is performed in UTC and returns `YYYY-MM-DD` strings, so a
 * process running in IST can never shift a date across midnight and manufacture
 * a `TIMING_DIFFERENCE` that does not exist.
 *
 * @see docs/DATA_MODEL.md §1 — why dates are `date`, not `timestamptz`
 * @module
 */

import type { IsoDate } from './types';

/** Milliseconds in one day. Exact — UTC has no daylight-saving transitions. */
const MS_PER_DAY = 86_400_000;

/**
 * Thrown when a string is not a valid `YYYY-MM-DD` calendar date.
 */
export class DateParseError extends Error {
  /** The raw input that could not be parsed. */
  public readonly input: string;

  constructor(input: string, reason: string) {
    super(`Cannot parse "${input}" as a calendar date: ${reason}`);
    this.name = 'DateParseError';
    this.input = input;
  }
}

/**
 * Reports whether a value is a well-formed `YYYY-MM-DD` calendar date.
 *
 * Rejects structurally valid but non-existent dates such as `2026-02-30`,
 * which `Date` would silently roll forward into March.
 *
 * @param value - An unknown value.
 * @returns `true` if the value is a real calendar date in ISO form.
 */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return false;
  // Round-trip guard: Date rolls 2026-02-30 forward to 2026-03-02 rather than
  // failing, so compare the normalised output against the input.
  return new Date(timestamp).toISOString().slice(0, 10) === value;
}

/**
 * Converts an ISO date to a UTC epoch timestamp.
 *
 * @param date - A `YYYY-MM-DD` calendar date.
 * @returns Milliseconds since the epoch at UTC midnight on that date.
 * @throws {DateParseError} If the input is not a real calendar date.
 */
function toTimestamp(date: IsoDate): number {
  if (!isIsoDate(date)) {
    throw new DateParseError(String(date), 'expected YYYY-MM-DD');
  }
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * Returns the calendar date `days` after the given date.
 *
 * @param date - The starting `YYYY-MM-DD` date.
 * @param days - Whole days to add; negative values move backwards.
 * @returns The resulting `YYYY-MM-DD` date.
 * @throws {DateParseError} If `date` is invalid.
 * @throws {RangeError} If `days` is not an integer.
 *
 * @example
 * addDays('2026-08-14', 3);  // '2026-08-17'
 * addDays('2026-03-01', -1); // '2026-02-28'
 */
export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) {
    throw new RangeError(`days must be an integer, got ${days}`);
  }
  const shifted = new Date(toTimestamp(date) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Returns the signed number of days from `from` to `to`.
 *
 * Positive when `to` is later. Used to compute the `dayDelta` carried on every
 * match, and to test date windows during reconciliation.
 *
 * @param from - The earlier (or reference) date.
 * @param to - The date being compared.
 * @returns Whole days between the two dates; `0` when they are the same day.
 * @throws {DateParseError} If either input is invalid.
 *
 * @example
 * daysBetween('2026-08-14', '2026-08-16'); //  2
 * daysBetween('2026-08-16', '2026-08-14'); // -2
 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  // Both operands are UTC midnight, so the difference is always a whole
  // multiple of MS_PER_DAY and this division is exact.
  return (toTimestamp(to) - toTimestamp(from)) / MS_PER_DAY;
}
