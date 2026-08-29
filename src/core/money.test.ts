/**
 * Tests for the money primitives.
 *
 * Parsing is the only non-trivial logic in `money.ts`, and it sits at the
 * ingestion trust boundary — every amount in the system passes through it. The
 * cases below cover the formats real exports actually contain, and pin the two
 * behaviours that are deliberate choices rather than incidental: excess
 * precision is rejected rather than rounded, and tolerance arithmetic truncates
 * toward zero.
 */

import { describe, expect, it } from 'vitest';
import {
  absMinor,
  addMinor,
  basisPointsOf,
  formatMinor,
  MoneyParseError,
  parseMinor,
  subMinor,
  sumMinor,
  toMinor,
  ZERO_MINOR,
} from './money';

describe('parseMinor', () => {
  it('parses a plain decimal amount', () => {
    expect(parseMinor('1250.50')).toBe(125050n);
  });

  it('parses an integer amount with no decimal point', () => {
    expect(parseMinor('1250')).toBe(125000n);
  });

  it('pads a single decimal place', () => {
    expect(parseMinor('1250.5')).toBe(125050n);
  });

  it('strips currency symbols and thousands separators', () => {
    expect(parseMinor('₹1,250.50')).toBe(125050n);
    expect(parseMinor('$1,250.50')).toBe(125050n);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseMinor('  1250.50  ')).toBe(125050n);
  });

  it('parses a minus-signed negative', () => {
    expect(parseMinor('-412.00')).toBe(-41200n);
  });

  it('parses an accounting-style parenthesised negative', () => {
    expect(parseMinor('(412.00)')).toBe(-41200n);
    // The symbol may sit either side of the parenthesis, depending on the export.
    expect(parseMinor('₹(412.00)')).toBe(-41200n);
    expect(parseMinor('(₹412.00)')).toBe(-41200n);
    expect(parseMinor('₹-412.00')).toBe(-41200n);
  });

  it('parses zero', () => {
    expect(parseMinor('0')).toBe(0n);
    expect(parseMinor('0.00')).toBe(0n);
  });

  it('handles amounts large enough to lose precision as a float', () => {
    // 90071992547409.91 exceeds Number.MAX_SAFE_INTEGER once in minor units;
    // a float-based parser would silently corrupt this value.
    expect(parseMinor('90071992547409.91')).toBe(9007199254740991n);
  });

  // The deliberate choice: reject rather than round. Rounding here would create
  // a discrepancy the engine later reports as a mismatch, with no way to trace
  // it back to the parse.
  it('rejects more than two decimal places instead of rounding', () => {
    expect(() => parseMinor('37.505')).toThrow(MoneyParseError);
    expect(() => parseMinor('37.505')).toThrow(/refusing to round/);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(() => parseMinor('')).toThrow(MoneyParseError);
    expect(() => parseMinor('   ')).toThrow(MoneyParseError);
  });

  it('rejects non-numeric input', () => {
    expect(() => parseMinor('abc')).toThrow(MoneyParseError);
    expect(() => parseMinor('12.3.4')).toThrow(MoneyParseError);
    expect(() => parseMinor('1,2 50-')).toThrow(MoneyParseError);
  });

  it('reports the offending input on the error', () => {
    try {
      parseMinor('37.505');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MoneyParseError);
      expect((error as MoneyParseError).input).toBe('37.505');
    }
  });
});

describe('formatMinor', () => {
  it('formats with thousands separators and fixed precision', () => {
    expect(formatMinor(toMinor(125050n))).toBe('₹1,250.50');
  });

  it('pads the fractional part', () => {
    expect(formatMinor(toMinor(125000n))).toBe('₹1,250.00');
    expect(formatMinor(toMinor(5n))).toBe('₹0.05');
  });

  it('separates thousands in large amounts', () => {
    expect(formatMinor(toMinor(123456789n))).toBe('₹1,234,567.89');
  });

  it('renders negatives with a minus sign by default', () => {
    expect(formatMinor(toMinor(-41200n))).toBe('-₹412.00');
  });

  it('renders negatives in parentheses in accounting mode', () => {
    expect(formatMinor(toMinor(-41200n), { accounting: true })).toBe('₹(412.00)');
  });

  it('accepts an alternative currency symbol', () => {
    expect(formatMinor(toMinor(125050n), { symbol: '$' })).toBe('$1,250.50');
  });

  it('round-trips with parseMinor', () => {
    const cases: ReadonlyArray<readonly [input: string, formatted: string]> = [
      ['1250.50', '1,250.50'],
      ['0.01', '0.01'],
      ['999999.99', '999,999.99'],
      ['1000000.00', '1,000,000.00'],
    ];
    for (const [input, formatted] of cases) {
      expect(formatMinor(parseMinor(input), { symbol: '' })).toBe(formatted);
    }
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(addMinor(toMinor(125050n), toMinor(41200n))).toBe(166250n);
    expect(subMinor(toMinor(125050n), toMinor(41200n))).toBe(83850n);
  });

  it('takes absolute values', () => {
    expect(absMinor(toMinor(-41200n))).toBe(41200n);
    expect(absMinor(toMinor(41200n))).toBe(41200n);
  });

  it('sums a list, returning zero for an empty one', () => {
    expect(sumMinor([toMinor(100n), toMinor(250n), toMinor(-50n)])).toBe(300n);
    expect(sumMinor([])).toBe(ZERO_MINOR);
  });

  it('does not accumulate error across many additions', () => {
    // The float equivalent of this (0.1 summed 1000 times) drifts from 100.
    const values = Array.from({ length: 1000 }, () => toMinor(10n));
    expect(sumMinor(values)).toBe(10000n);
  });

  it('is exact for the classic float failure case', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; in minor units it is exact.
    expect(addMinor(parseMinor('0.10'), parseMinor('0.20'))).toBe(parseMinor('0.30'));
  });
});

describe('basisPointsOf', () => {
  it('computes a percentage tolerance in integer space', () => {
    // 0.5% of ₹1,250.50 = ₹6.2525 → truncates to ₹6.25
    expect(basisPointsOf(toMinor(125050n), 50)).toBe(625n);
  });

  it('truncates toward zero rather than rounding up', () => {
    // Erring tight produces an extra exception to dismiss; erring loose risks a
    // false match, which is the failure this system exists to prevent.
    expect(basisPointsOf(toMinor(199n), 50)).toBe(0n);
  });

  it('ignores the sign of the base amount', () => {
    expect(basisPointsOf(toMinor(-125050n), 50)).toBe(625n);
  });

  it('returns zero for a zero rate', () => {
    expect(basisPointsOf(toMinor(125050n), 0)).toBe(0n);
  });

  it('rejects a negative or non-integer rate', () => {
    expect(() => basisPointsOf(toMinor(100n), -1)).toThrow(RangeError);
    expect(() => basisPointsOf(toMinor(100n), 1.5)).toThrow(RangeError);
  });
});
