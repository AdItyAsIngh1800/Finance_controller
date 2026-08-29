/**
 * Bigint-safe encoding for JSONB columns.
 *
 * `detail` and `evidence` are stored as JSONB but contain `Minor` values, which
 * are `bigint` — a type JSON cannot represent and `JSON.stringify` throws on.
 *
 * The obvious workaround, converting to `Number`, is exactly the bug the branded
 * money type exists to prevent: it would silently reintroduce floats into the
 * money path at the persistence boundary, where nothing would catch it. Values
 * are therefore encoded as decimal *strings* and read back through `BigInt`,
 * which round-trips exactly at any magnitude.
 *
 * @see docs/DATA_MODEL.md §1 — money is integer minor units
 * @module
 */

import { toMinor, type Minor } from '@/core/money';

/** Keys whose values are monetary and must survive as `bigint`. */
const MINOR_KEY_PATTERN = /Minor$/;

/**
 * Encodes a value for storage in a JSONB column.
 *
 * Any property whose name ends in `Minor` is written as a decimal string.
 *
 * @param value - The value to encode.
 * @returns A JSON-safe structure.
 */
export function encodeForJsonb(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(encodeForJsonb);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        encodeForJsonb(item),
      ]),
    );
  }
  return value;
}

/**
 * Decodes a value read from a JSONB column.
 *
 * Reverses {@link encodeForJsonb}: properties named `*Minor` are converted back
 * to `bigint`. Keyed on the property name rather than on the string's shape,
 * because a reference or narration could legitimately look numeric and must not
 * be coerced.
 *
 * @param value - The value read from the database.
 * @returns The value with monetary fields restored to `bigint`.
 */
export function decodeFromJsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeFromJsonb);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (MINOR_KEY_PATTERN.test(key) && (typeof item === 'string' || typeof item === 'number')) {
          return [key, BigInt(item)];
        }
        return [key, decodeFromJsonb(item)];
      }),
    );
  }
  return value;
}

/**
 * Reads a monetary column into a `Minor`.
 *
 * PostgREST may return a `bigint` column as either a number or a string
 * depending on magnitude, so both are accepted. Going through `BigInt` rather
 * than arithmetic keeps the value exact either way.
 *
 * @param value - The raw column value.
 * @returns The amount in minor units.
 * @throws {TypeError} If the value is not an integer-valued number or string.
 */
export function readMinorColumn(value: unknown): Minor {
  if (typeof value === 'bigint') return toMinor(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Monetary column held a non-integer value: ${value}`);
    }
    return toMinor(BigInt(value));
  }
  if (typeof value === 'string') return toMinor(BigInt(value));
  throw new TypeError(`Monetary column held an unreadable value: ${String(value)}`);
}
