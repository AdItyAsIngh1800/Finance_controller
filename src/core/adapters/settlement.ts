/**
 * Settlement CSV adapter.
 *
 * Converts a payment-processor settlement export into normalized records,
 * carrying the fee breakdown through in the `detail` payload so the engine can
 * verify the settlement identity and the Q&A agent can quote the individual
 * lines.
 *
 * @see docs/DATA_MODEL.md §5 — the settlement detail payload
 * @module
 */

import { isIsoDate } from '../dates';
import { MoneyParseError, parseMinor, toMinor, type Minor } from '../money';
import { normalizeRef } from '../refs';
import type { FeeLine, NormalizedRecord, RecordSide, SettlementDetail } from '../types';
import { columnReader, missingColumns, parseCsv, type CsvRow, type CsvTable } from './csv';
import type { AdapterResult, RowError } from './types';

/** Columns without which the file cannot be interpreted at all. */
const REQUIRED_COLUMNS = ['order_ref', 'txn_date', 'net'] as const;

/**
 * Reads an optional monetary column, defaulting to zero.
 *
 * Absent and blank are treated as zero because real exports omit columns that
 * do not apply — a payout with no chargeback simply has no chargeback figure.
 * A *present but unparseable* value is an error, not a zero: silently reading
 * `"N/A"` as nothing would understate a discrepancy.
 */
function optionalAmount(
  read: (row: CsvRow, column: string) => string | undefined,
  row: CsvRow,
  column: string,
  errors: RowError[],
): Minor {
  const raw = read(row, column);
  if (raw === undefined || raw.trim().length === 0) return toMinor(0n);
  try {
    return parseMinor(raw);
  } catch (error) {
    errors.push({
      lineNumber: row.lineNumber,
      column,
      reason: error instanceof MoneyParseError ? error.message : String(error),
    });
    return toMinor(0n);
  }
}

/**
 * Parses a settlement CSV into normalized records.
 *
 * @param text - Raw file contents.
 * @param side - Which side of the reconciliation this file represents.
 * @returns Records successfully converted, plus a row-level error for each that
 *   could not be.
 */
export function parseSettlementCsv(text: string, side: RecordSide): AdapterResult {
  let table: CsvTable;
  try {
    table = parseCsv(text);
  } catch (error) {
    return {
      records: [],
      errors: [{ lineNumber: 1, reason: error instanceof Error ? error.message : String(error) }],
    };
  }

  const absent = missingColumns(table, REQUIRED_COLUMNS);
  if (absent.length > 0) {
    // Reported once against the header rather than repeated per row: the file
    // has the wrong shape, which is a single problem.
    return {
      records: [],
      errors: [
        {
          lineNumber: 1,
          reason: `missing required column(s): ${absent.join(', ')}. Expected at least ${REQUIRED_COLUMNS.join(', ')}.`,
        },
      ],
    };
  }

  const read = columnReader(table);
  const records: NormalizedRecord[] = [];
  const errors: RowError[] = [];

  for (const row of table.rows) {
    const rowErrorCount = errors.length;

    const externalRef = (read(row, 'order_ref') ?? '').trim();
    if (externalRef.length === 0) {
      errors.push({ lineNumber: row.lineNumber, column: 'order_ref', reason: 'reference is empty' });
    }

    const date = (read(row, 'txn_date') ?? '').trim();
    if (!isIsoDate(date)) {
      errors.push({
        lineNumber: row.lineNumber,
        column: 'txn_date',
        reason: `"${date}" is not a valid YYYY-MM-DD date`,
      });
    }

    let netMinor: Minor = toMinor(0n);
    const rawNet = (read(row, 'net') ?? '').trim();
    try {
      netMinor = parseMinor(rawNet);
    } catch (error) {
      errors.push({
        lineNumber: row.lineNumber,
        column: 'net',
        reason: error instanceof MoneyParseError ? error.message : String(error),
      });
    }

    const grossMinor = optionalAmount(read, row, 'gross', errors);
    const commission = optionalAmount(read, row, 'commission', errors);
    const gateway = optionalAmount(read, row, 'gateway_fee', errors);
    const refundsMinor = optionalAmount(read, row, 'refunds', errors);
    const chargebacksMinor = optionalAmount(read, row, 'chargebacks', errors);

    // `fees_total` is read as stated rather than derived from the itemised
    // columns. A total that does not equal its parts is exactly the FEE_VARIANCE
    // anomaly the engine exists to catch — recomputing it here would erase the
    // finding before the engine ever saw the file.
    const rawFeesTotal = (read(row, 'fees_total') ?? '').trim();
    const feesMinor =
      rawFeesTotal.length > 0
        ? optionalAmount(read, row, 'fees_total', errors)
        : ((commission + gateway) as Minor);

    // Skip constructing a record if this row produced any error.
    if (errors.length > rowErrorCount) continue;

    const feeLines: FeeLine[] = [];
    if (commission !== 0n) feeLines.push({ label: 'Platform commission', amountMinor: commission });
    if (gateway !== 0n) feeLines.push({ label: 'Payment gateway', amountMinor: gateway });

    const detail: SettlementDetail = {
      kind: 'settlement',
      grossMinor,
      feesMinor,
      refundsMinor,
      chargebacksMinor,
      netMinor,
      feeLines,
    };

    records.push({
      // Transient: rows are assigned database identifiers on insert. Retaining
      // the file's own id where present keeps errors traceable back to source.
      id: (read(row, 'record_id') ?? `line-${row.lineNumber}`).trim(),
      side,
      externalRef,
      normalizedRef: normalizeRef(externalRef),
      date,
      amountMinor: netMinor,
      description: (read(row, 'description') ?? '').trim(),
      detail,
    });
  }

  return { records, errors };
}
