/**
 * RFC 4180 CSV parser.
 *
 * Hand-rolled rather than taken from a dependency, because the surface actually
 * needed here is small and the edge cases are worth stating explicitly rather
 * than trusting: quoted fields, doubled quotes as escapes, newlines *inside*
 * quoted fields, CRLF endings, and a leading byte-order mark that Excel adds
 * without asking.
 *
 * Every row carries the physical line it began on. Ingestion must be able to
 * tell a user *which* row it rejected — "malformed CSV" is not a usable error
 * message for someone holding a 250-row export.
 *
 * @see docs/REQUIREMENTS.md FR-3.3 — malformed rows rejected with a reason
 * @module
 */

/** One parsed data row, with the physical line it started on. */
export interface CsvRow {
  /** 1-based line number in the source text. The header is line 1. */
  readonly lineNumber: number;
  /** Field values, in column order, with quotes resolved. */
  readonly values: readonly string[];
}

/** A parsed CSV table. */
export interface CsvTable {
  /** Header names, trimmed and lowercased for case-insensitive lookup. */
  readonly header: readonly string[];
  /** Data rows, excluding the header. */
  readonly rows: readonly CsvRow[];
}

/** Thrown when the text cannot be parsed as CSV at all. */
export class CsvParseError extends Error {
  /** The line at which parsing failed, where known. */
  public readonly lineNumber: number | undefined;

  constructor(message: string, lineNumber?: number) {
    super(lineNumber === undefined ? message : `Line ${lineNumber}: ${message}`);
    this.name = 'CsvParseError';
    this.lineNumber = lineNumber;
  }
}

/**
 * Parses CSV text into a header and rows.
 *
 * Blank lines are skipped rather than treated as empty rows: exports frequently
 * end with one, and a trailing empty record would be reported as a malformed row
 * on every otherwise-valid file.
 *
 * @param text - Raw file contents.
 * @returns The parsed table.
 * @throws {CsvParseError} If the text is empty, or a quoted field is unterminated.
 *
 * @example
 * parseCsv('a,b\n1,"x,y"\n');
 * // { header: ['a','b'], rows: [{ lineNumber: 2, values: ['1','x,y'] }] }
 */
export function parseCsv(text: string): CsvTable {
  // Excel and several bank portals prefix exports with a BOM. Left in place it
  // becomes part of the first header name, and every column lookup then fails
  // for reasons invisible in a diff.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: { lineNumber: number; values: string[] }[] = [];
  let field = '';
  let values: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let sawAnyChar = false;

  /** Closes the current field. */
  const endField = (): void => {
    values.push(field);
    field = '';
  };

  /** Closes the current record, discarding it if it is a blank line. */
  const endRecord = (): void => {
    endField();
    const isBlank = values.length === 1 && values[0]?.trim() === '';
    if (!isBlank) records.push({ lineNumber: recordStartLine, values });
    values = [];
    recordStartLine = line;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) continue;
    sawAnyChar = true;

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }

    switch (char) {
      case '"':
        inQuotes = true;
        break;
      case ',':
        endField();
        break;
      case '\r':
        // CRLF: consume the pair as one terminator.
        if (source[index + 1] === '\n') index += 1;
        line += 1;
        endRecord();
        break;
      case '\n':
        line += 1;
        endRecord();
        break;
      default:
        field += char;
    }
  }

  if (inQuotes) {
    throw new CsvParseError('unterminated quoted field', recordStartLine);
  }

  // Flush a final record not followed by a newline.
  if (field.length > 0 || values.length > 0) endRecord();

  if (!sawAnyChar || records.length === 0) {
    throw new CsvParseError('file is empty');
  }

  const headerRecord = records[0];
  if (headerRecord === undefined) throw new CsvParseError('file has no header row');

  return {
    header: headerRecord.values.map((name) => name.trim().toLowerCase()),
    rows: records.slice(1).map((record) => ({
      lineNumber: record.lineNumber,
      values: record.values,
    })),
  };
}

/**
 * Builds a case-insensitive column lookup for a parsed table.
 *
 * @param table - The parsed table.
 * @returns A function from column name to that row's value, or `undefined`.
 */
export function columnReader(
  table: CsvTable,
): (row: CsvRow, column: string) => string | undefined {
  const indexByName = new Map<string, number>();
  table.header.forEach((name, index) => indexByName.set(name, index));

  return (row, column) => {
    const index = indexByName.get(column.trim().toLowerCase());
    if (index === undefined) return undefined;
    return row.values[index];
  };
}

/**
 * Reports which of the required columns are absent from a table.
 *
 * Checked up front so a file with the wrong shape fails once, naming what is
 * missing, rather than producing one error per row.
 *
 * @param table - The parsed table.
 * @param required - Column names that must be present.
 * @returns The missing column names, empty when all are present.
 */
export function missingColumns(
  table: CsvTable,
  required: readonly string[],
): readonly string[] {
  const present = new Set(table.header);
  return required.filter((name) => !present.has(name.toLowerCase()));
}
