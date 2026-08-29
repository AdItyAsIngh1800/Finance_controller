/**
 * Bank statement CSV adapter.
 *
 * Converts a bank statement export into normalized records. Two things make
 * this domain different from settlement, and both are resolved *here* so the
 * engine never learns about either:
 *
 * 1. **Direction lives in separate columns.** A statement expresses money in and
 *    money out as `debit` and `credit`, each blank when it does not apply. This
 *    adapter folds that into the sign of `amountMinor` — credits positive,
 *    debits negative — so the engine compares amounts without ever reasoning
 *    about which way the money went.
 * 2. **There is no settlement identity to verify.** Bank records carry no
 *    gross/fees/net breakdown, so `FEE_VARIANCE` is structurally impossible
 *    rather than merely suppressed.
 *
 * @see docs/ARCHITECTURE.md §3 — adapters own sign conventions
 * @see docs/REQUIREMENTS.md FR-8.3 — no engine changes
 * @module
 */

import { isIsoDate } from '../dates';
import { MoneyParseError, parseMinor, toMinor, type Minor } from '../money';
import { normalizeRef } from '../refs';
import type { BankDetail, NormalizedRecord, RecordSide } from '../types';
import { columnReader, missingColumns, parseCsv, type CsvRow, type CsvTable } from './csv';
import type { AdapterResult, RowError } from './types';

/**
 * Columns without which the file cannot be interpreted.
 *
 * `debit` and `credit` are both required to be *present*, though each row fills
 * only one. A statement exporting a single signed `amount` column instead is
 * not supported — see docs/EVALUATION.md §6.
 */
const REQUIRED_COLUMNS = ['txn_date', 'reference', 'debit', 'credit'] as const;

/**
 * Reads an optional monetary column, returning `null` when blank.
 *
 * Distinguished from zero deliberately: a blank `debit` means "this row is not a
 * debit", whereas a `debit` of `0.00` would be a zero-value debit. Collapsing
 * the two would make direction ambiguous.
 */
function optionalAmount(
  read: (row: CsvRow, column: string) => string | undefined,
  row: CsvRow,
  column: string,
  errors: RowError[],
): Minor | null {
  const raw = read(row, column);
  if (raw === undefined || raw.trim().length === 0) return null;
  try {
    return parseMinor(raw);
  } catch (error) {
    errors.push({
      lineNumber: row.lineNumber,
      column,
      reason: error instanceof MoneyParseError ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Parses a bank statement CSV into normalized records.
 *
 * @param text - Raw file contents.
 * @param side - Which side of the reconciliation this file represents.
 * @returns Records successfully converted, plus a row-level error for each that
 *   could not be.
 */
export function parseBankCsv(text: string, side: RecordSide): AdapterResult {
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
    return {
      records: [],
      errors: [
        {
          lineNumber: 1,
          reason:
            `missing required column(s): ${absent.join(', ')}. ` +
            `Expected at least ${REQUIRED_COLUMNS.join(', ')}.`,
        },
      ],
    };
  }

  const read = columnReader(table);
  const records: NormalizedRecord[] = [];
  const errors: RowError[] = [];

  for (const row of table.rows) {
    const rowErrorCount = errors.length;

    const externalRef = (read(row, 'reference') ?? '').trim();
    if (externalRef.length === 0) {
      errors.push({ lineNumber: row.lineNumber, column: 'reference', reason: 'reference is empty' });
    }

    const date = (read(row, 'txn_date') ?? '').trim();
    if (!isIsoDate(date)) {
      errors.push({
        lineNumber: row.lineNumber,
        column: 'txn_date',
        reason: `"${date}" is not a valid YYYY-MM-DD date`,
      });
    }

    const debit = optionalAmount(read, row, 'debit', errors);
    const credit = optionalAmount(read, row, 'credit', errors);

    if (debit !== null && credit !== null) {
      errors.push({
        lineNumber: row.lineNumber,
        reason: 'row has both a debit and a credit; a statement line is one or the other',
      });
    }
    if (debit === null && credit === null && errors.length === rowErrorCount) {
      errors.push({
        lineNumber: row.lineNumber,
        reason: 'row has neither a debit nor a credit amount',
      });
    }

    if (errors.length > rowErrorCount) continue;

    // The sign convention, applied once, here. Everything downstream — the
    // engine, the UI, the agent — sees a signed amount and nothing else.
    const isDebit = debit !== null;
    const magnitude = (debit ?? credit) as Minor;
    const amountMinor = toMinor(isDebit ? -magnitude : magnitude);

    const balanceMinor = optionalAmount(read, row, 'balance', errors);
    const narration = (read(row, 'narration') ?? '').trim();

    const detail: BankDetail = {
      kind: 'bank',
      narration,
      // Retained for display only. The adapter has already folded it into the
      // sign above, so nothing downstream consults it to decide anything.
      direction: isDebit ? 'debit' : 'credit',
      ...(balanceMinor === null ? {} : { balanceMinor }),
    };

    records.push({
      id: (read(row, 'record_id') ?? `line-${row.lineNumber}`).trim(),
      side,
      externalRef,
      normalizedRef: normalizeRef(externalRef),
      date,
      amountMinor,
      description: (read(row, 'description') ?? narration).trim(),
      detail,
    });
  }

  return { records, errors };
}
