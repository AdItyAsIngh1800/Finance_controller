/**
 * Money primitives for the reconciliation core.
 *
 * Every monetary value in this system is an **integer count of minor units**
 * (paise for INR), represented as a branded `bigint`. Floating point never
 * touches the money path.
 *
 * This is not a stylistic preference. A reconciliation engine exists to decide
 * whether two figures are the same; IEEE-754 drift of 0.001 produces a
 * discrepancy that is invisible in the UI but changes the answer. Representing
 * money as `bigint` makes that class of bug unrepresentable.
 *
 * The brand goes one step further: a plain `bigint` cannot be passed where a
 * `Minor` is expected without going through an explicit converter, so a raw
 * numeric value can never silently enter the money path.
 *
 * @see docs/DATA_MODEL.md §1 — governing principles
 * @see docs/REQUIREMENTS.md NFR-1.3 — no float operations on money
 * @module
 */

/** Brand marker. Declared, never instantiated — it exists only in the type system. */
declare const MINOR_UNITS: unique symbol;

/**
 * A monetary amount in integer minor units (paise).
 *
 * `₹1,250.50` is `125050n`. Negative values represent debits or reductions.
 *
 * Values of this type can only be produced by {@link toMinor}, {@link parseMinor},
 * or the arithmetic helpers in this module.
 */
export type Minor = bigint & { readonly [MINOR_UNITS]: true };

/**
 * Decimal places in a major unit. `2` for INR (100 paise = ₹1).
 *
 * Single-currency by design; see docs/PRD.md §6 for why multi-currency is out
 * of scope rather than merely unimplemented.
 */
export const CURRENCY_SCALE = 2 as const;

/** Zero, as a `Minor`. Provided because `0n` cannot be used directly. */
export const ZERO_MINOR: Minor = 0n as Minor;

/**
 * Thrown when a string cannot be parsed into an exact minor-unit amount.
 *
 * Deliberately a distinct error type: ingestion must be able to reject a row
 * with a specific, reportable reason rather than failing opaquely.
 *
 * @see docs/REQUIREMENTS.md FR-3.3 — malformed rows are rejected with a reason
 */
export class MoneyParseError extends Error {
  /** The raw input that could not be parsed. */
  public readonly input: string;

  constructor(input: string, reason: string) {
    super(`Cannot parse "${input}" as a monetary amount: ${reason}`);
    this.name = 'MoneyParseError';
    this.input = input;
  }
}

/**
 * Brands an already-integral `bigint` as a minor-unit amount.
 *
 * Use this only where the value is known to be a count of minor units — for
 * example, a `bigint` read back from the database's `amount_minor` column.
 *
 * @param value - An integer count of minor units.
 * @returns The same value, typed as {@link Minor}.
 */
export function toMinor(value: bigint): Minor {
  return value as Minor;
}

/**
 * Converts a `Minor` back to a plain `bigint`, discarding the brand.
 *
 * Needed at persistence boundaries where a driver expects an unbranded value.
 *
 * @param value - A minor-unit amount.
 * @returns The underlying `bigint`.
 */
export function fromMinor(value: Minor): bigint {
  return value as bigint;
}

/**
 * Parses a human or machine written amount into exact minor units.
 *
 * Accepts optional currency symbols, thousands separators, surrounding
 * whitespace, a leading minus sign, and accounting-style parentheses for
 * negatives. The fractional part must not exceed {@link CURRENCY_SCALE} digits.
 *
 * **Excess precision is rejected, not rounded.** A value like `"37.505"` throws
 * rather than silently becoming `37.50`. Rounding an input would introduce a
 * discrepancy the engine would later report as a mismatch with no way to trace
 * it back to the parse — the very failure this system exists to prevent. The
 * caller surfaces the rejection as a row-level ingestion error.
 *
 * @param input - Raw amount text, e.g. `"₹1,250.50"`, `"-42.00"`, `"(412.00)"`.
 * @returns The amount in minor units.
 * @throws {MoneyParseError} If the input is empty, malformed, or carries more
 *   than {@link CURRENCY_SCALE} fractional digits.
 *
 * @example
 * parseMinor('₹1,250.50'); // 125050n
 * parseMinor('(412.00)');  // -41200n
 * parseMinor('37.505');    // throws MoneyParseError
 */
export function parseMinor(input: string): Minor {
  if (typeof input !== 'string') {
    throw new MoneyParseError(String(input), 'expected a string');
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new MoneyParseError(input, 'value is empty');
  }

  // Strip currency symbols, thousands separators and internal spaces first.
  // Sign markers must be detected *after* this: real exports place the symbol
  // either inside or outside the parentheses ("₹(412.00)" and "(₹412.00)" are
  // both encountered), so detecting parentheses on the raw string misses one.
  const cleaned = trimmed.replace(/[₹$€£,\s]/g, '');
  if (cleaned.length === 0) {
    throw new MoneyParseError(input, 'no digits present');
  }

  // Accounting convention wraps negatives in parentheses: (412.00) === -412.00
  const isParenthesised = cleaned.startsWith('(') && cleaned.endsWith(')');
  const unwrapped = isParenthesised ? cleaned.slice(1, -1) : cleaned;

  const isMinusSigned = unwrapped.startsWith('-');
  const unsigned = isMinusSigned ? unwrapped.slice(1) : unwrapped;

  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw new MoneyParseError(input, 'contains unexpected characters');
  }

  const [integerPart = '', fractionPart = ''] = unsigned.split('.');

  if (fractionPart.length > CURRENCY_SCALE) {
    throw new MoneyParseError(
      input,
      `more than ${CURRENCY_SCALE} decimal places — refusing to round, as this ` +
        `would create an untraceable discrepancy`,
    );
  }

  const paddedFraction = fractionPart.padEnd(CURRENCY_SCALE, '0');
  const magnitude = BigInt(integerPart + paddedFraction);
  const negative = isParenthesised || isMinusSigned;

  return (negative ? -magnitude : magnitude) as Minor;
}

/**
 * Formats a minor-unit amount for display.
 *
 * @param value - The amount to format.
 * @param options - Formatting options.
 * @param options.accounting - When `true`, renders negatives in parentheses
 *   (`(412.00)`) per the accounting convention used in the UI. Defaults to
 *   `false`, which renders a leading minus sign.
 * @param options.symbol - Currency symbol to prefix. Defaults to `'₹'`.
 * @returns A display string with thousands separators and fixed precision.
 *
 * @example
 * formatMinor(125050n as Minor);                       // '₹1,250.50'
 * formatMinor(-41200n as Minor, { accounting: true }); // '₹(412.00)'
 */
export function formatMinor(
  value: Minor,
  options: { accounting?: boolean; symbol?: string } = {},
): string {
  const { accounting = false, symbol = '₹' } = options;

  const negative = value < 0n;
  const magnitude = negative ? -value : value;

  const divisor = 10n ** BigInt(CURRENCY_SCALE);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;

  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fractionText = fraction.toString().padStart(CURRENCY_SCALE, '0');
  const body = `${symbol}${wholeText}.${fractionText}`;

  if (!negative) return body;
  return accounting ? `${symbol}(${wholeText}.${fractionText})` : `-${body}`;
}

/** Adds two amounts. */
export function addMinor(a: Minor, b: Minor): Minor {
  return (a + b) as Minor;
}

/** Subtracts `b` from `a`. */
export function subMinor(a: Minor, b: Minor): Minor {
  return (a - b) as Minor;
}

/** Returns the absolute value of an amount. */
export function absMinor(value: Minor): Minor {
  return (value < 0n ? -value : value) as Minor;
}

/** Sums a list of amounts. Returns {@link ZERO_MINOR} for an empty list. */
export function sumMinor(values: readonly Minor[]): Minor {
  let total = 0n;
  for (const value of values) total += value;
  return total as Minor;
}

/**
 * Computes a basis-point fraction of an amount, in integer space.
 *
 * Used for percentage-based matching tolerances. Division truncates toward
 * zero, which marginally tightens the tolerance — a deliberate choice, since
 * erring tight produces an extra exception for a human to dismiss, whereas
 * erring loose risks a false match (see docs/ARCHITECTURE.md §4 on asymmetric
 * error handling).
 *
 * @param value - The base amount.
 * @param basisPoints - Fraction in basis points; `50` is 0.5%.
 * @returns The fraction of `value`, as an absolute (unsigned) amount.
 *
 * @example
 * basisPointsOf(125050n as Minor, 50); // 625n — 0.5% of ₹1,250.50
 */
export function basisPointsOf(value: Minor, basisPoints: number): Minor {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError(`basisPoints must be a non-negative integer, got ${basisPoints}`);
  }
  const magnitude = value < 0n ? -value : value;
  return ((magnitude * BigInt(basisPoints)) / 10_000n) as Minor;
}

/** Returns the larger of two amounts. */
export function maxMinor(a: Minor, b: Minor): Minor {
  return (a > b ? a : b) as Minor;
}
