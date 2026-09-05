/**
 * Hand-written edge-case datasets.
 *
 * The seeded generators in this directory produce *realistic* data: well-formed
 * files with known discrepancies planted in them. They deliberately never
 * produce a file a user might actually upload by mistake — a ragged export, a
 * semicolon-delimited European CSV, an amount with three decimal places, a
 * statement row carrying both a debit and a credit. Nothing in the ground-truth
 * suite exercises those paths, so the adapters' error reporting is validated by
 * nothing.
 *
 * Each case here is a small, deliberately hostile pair of files plus the exact
 * outcome it must produce. They serve two audiences:
 *
 * - `edge-cases.test.ts` asserts every stated expectation, so a regression in
 *   parsing or matching fails the suite rather than surfacing during a demo.
 * - `npm run generate:fixtures` writes them to `fixtures/edge-cases/<name>/`,
 *   so the same inputs can be dragged into the upload screen to check that the
 *   *application* reports them as usefully as the core does.
 *
 * Expectations are the observed behaviour of the current code, reviewed and
 * judged correct — not aspirations. Where the behaviour is surprising but
 * defensible, the case's `what` says so; those are the cases worth reading.
 *
 * @see docs/REQUIREMENTS.md FR-3.3 — malformed rows rejected with a reason
 * @see docs/EVALUATION.md §6 — known limitations
 * @module
 */

import type { Domain, ExceptionType } from '../taxonomy';

/** What a case's two files must produce, once parsed and reconciled. */
export interface EdgeCaseExpectation {
  /** Records the source file yields after parsing. */
  readonly sourceRecords: number;
  /** Row-level errors the source file must report. */
  readonly sourceErrors: number;
  /** Records the ledger file yields after parsing. */
  readonly ledgerRecords: number;
  /** Row-level errors the ledger file must report. */
  readonly ledgerErrors: number;
  /** Matches the engine makes from whatever parsed. */
  readonly matches: number;
  /**
   * Exceptions by type. Types absent from this map must not be raised at all,
   * so a new spurious exception fails the case rather than going unnoticed.
   */
  readonly exceptions: Partial<Record<ExceptionType, number>>;
}

/** One hostile input pair and the outcome it must produce. */
export interface EdgeCase {
  /** Kebab-case identifier; also the fixture directory name. */
  readonly name: string;
  /** Which adapter parses these files. */
  readonly domain: Domain;
  /** Which axis this case probes, for grouping in the test output. */
  readonly category: 'malformed file' | 'hostile value' | 'engine scenario' | 'domain quirk';
  /** One line on what the input contains and why the outcome is what it is. */
  readonly what: string;
  /** Raw external-record file contents. */
  readonly sourceCsv: string;
  /** Raw internal-ledger file contents. */
  readonly ledgerCsv: string;
  readonly expect: EdgeCaseExpectation;
}

/** Settlement column shape, matching what `settlementToCsv` emits. */
const S_HEADER =
  'record_id,order_ref,txn_date,gross,commission,gateway_fee,fees_total,refunds,chargebacks,net,description';

/** Bank column shape, matching what `bankToCsv` emits. */
const B_HEADER = 'record_id,txn_date,narration,reference,debit,credit,balance,description';

/**
 * Assembles a file from a header and rows.
 *
 * @param header - The column row.
 * @param rows - Data rows, already comma-joined.
 * @returns CSV text with a trailing newline, as every real export has.
 */
function csv(header: string, ...rows: readonly string[]): string {
  return `${[header, ...rows].join('\n')}\n`;
}

/** A settlement row whose fee arithmetic balances: 1000 − 30 = 970. */
function cleanSettlementRow(id: string, ref: string, date: string): string {
  return `${id},${ref},${date},1000.00,20.00,10.00,30.00,0.00,0.00,970.00,Payout ${ref}`;
}

/**
 * A description long enough to exceed any incidental column width, containing
 * the two characters CSV has to escape.
 */
const LONG_DESCRIPTION = `Adjustment narrative, with commas, and ""doubled quotes"", repeated to length: ${'lorem ipsum dolor sit amet, '.repeat(16)}end`;

/**
 * The edge-case corpus.
 *
 * Ordered by category so the generated fixture directory reads as a checklist
 * rather than an alphabetical pile.
 */
export const EDGE_CASES: readonly EdgeCase[] = [
  // --- Malformed files ------------------------------------------------------
  {
    name: 'ragged-rows',
    domain: 'settlement',
    category: 'malformed file',
    what: 'A row truncated to three columns and a row with two columns too many. The short row loses its `net` and is rejected; the long row is read from its header positions and the surplus ignored.',
    sourceCsv: csv(
      S_HEADER,
      cleanSettlementRow('s-1', 'ORD-9001', '2026-08-01'),
      's-2,ORD-9002,2026-08-02',
      `${cleanSettlementRow('s-3', 'ORD-9003', '2026-08-03')},extra,columns`,
    ),
    ledgerCsv: csv(
      S_HEADER,
      cleanSettlementRow('l-1', 'ORD-9001', '2026-08-01'),
      cleanSettlementRow('l-2', 'ORD-9002', '2026-08-02'),
      cleanSettlementRow('l-3', 'ORD-9003', '2026-08-03'),
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 1,
      ledgerRecords: 3,
      ledgerErrors: 0,
      matches: 2,
      exceptions: { UNMATCHED_LEDGER: 1 },
    },
  },
  {
    name: 'header-only',
    domain: 'settlement',
    category: 'malformed file',
    what: 'Both files carry a valid header and no data. This is not an error — an export with nothing in it is a legitimate, if useless, file — so it must reconcile to nothing rather than throw.',
    sourceCsv: csv(S_HEADER),
    ledgerCsv: csv(S_HEADER),
    expect: {
      sourceRecords: 0,
      sourceErrors: 0,
      ledgerRecords: 0,
      ledgerErrors: 0,
      matches: 0,
      exceptions: {},
    },
  },
  {
    name: 'empty-source-file',
    domain: 'settlement',
    category: 'malformed file',
    what: 'A zero-byte source file against a valid ledger. The file is rejected whole, and every ledger entry is then unconfirmed.',
    sourceCsv: '',
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9101', '2026-08-01')),
    expect: {
      sourceRecords: 0,
      sourceErrors: 1,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { UNMATCHED_LEDGER: 1 },
    },
  },
  {
    name: 'unterminated-quote',
    domain: 'settlement',
    category: 'malformed file',
    what: 'A quoted description that is never closed swallows the rest of the file. Parsing fails as a whole, naming the line the quote opened on.',
    sourceCsv: `${S_HEADER}\ns-1,ORD-9201,2026-08-01,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,"Payout ORD-9201\n`,
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9201', '2026-08-01')),
    expect: {
      sourceRecords: 0,
      sourceErrors: 1,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { UNMATCHED_LEDGER: 1 },
    },
  },
  {
    name: 'semicolon-delimited',
    domain: 'settlement',
    category: 'malformed file',
    what: 'A European-locale export delimited with semicolons. Every column collapses into one header name, so the file fails on its shape — one error naming the missing columns, not one per row.',
    sourceCsv: `${S_HEADER.replace(/,/g, ';')}\ns-1;ORD-9301;2026-08-01;1000,00;20,00;10,00;30,00;0,00;0,00;970,00;Payout\n`,
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9301', '2026-08-01')),
    expect: {
      sourceRecords: 0,
      sourceErrors: 1,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { UNMATCHED_LEDGER: 1 },
    },
  },
  {
    name: 'duplicate-column-names',
    domain: 'settlement',
    category: 'malformed file',
    what: 'A header carrying `net` twice. The column lookup keeps the last occurrence, so the second value wins silently — surfacing here as an amount mismatch against the ledger plus a broken fee identity, which is a great deal more visible than a wrong figure would be.',
    sourceCsv: csv(
      `${S_HEADER},net`,
      's-1,ORD-9401,2026-08-01,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,Payout ORD-9401,12.34',
    ),
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9401', '2026-08-01')),
    expect: {
      sourceRecords: 1,
      sourceErrors: 0,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { AMOUNT_MISMATCH: 1, FEE_VARIANCE: 1 },
    },
  },
  {
    name: 'bom-crlf-no-trailing-newline',
    domain: 'settlement',
    category: 'malformed file',
    what: 'Excel’s three afflictions at once: a leading byte-order mark, CRLF endings, and no newline after the final row. All three are absorbed, so the file reconciles exactly as its plain equivalent would.',
    sourceCsv: `﻿${[
      S_HEADER,
      cleanSettlementRow('s-1', 'ORD-9501', '2026-08-01'),
      cleanSettlementRow('s-2', 'ORD-9502', '2026-08-02'),
    ].join('\r\n')}`,
    ledgerCsv: csv(
      S_HEADER,
      cleanSettlementRow('l-1', 'ORD-9501', '2026-08-01'),
      cleanSettlementRow('l-2', 'ORD-9502', '2026-08-02'),
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: {},
    },
  },

  // --- Hostile values -------------------------------------------------------
  {
    name: 'zero-and-negative-amounts',
    domain: 'settlement',
    category: 'hostile value',
    what: 'A zero-value payout and a reversal booked as a negative net. Neither is an error, and both must match on their reference without the tolerance arithmetic dividing by anything.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ORD-9601,2026-08-01,0.00,0.00,0.00,0.00,0.00,0.00,0.00,Zero-value payout',
      's-2,ORD-9602,2026-08-02,-500.00,0.00,0.00,0.00,0.00,0.00,-500.00,Reversal',
    ),
    ledgerCsv: csv(
      S_HEADER,
      'l-1,ORD-9601,2026-08-01,0.00,0.00,0.00,0.00,0.00,0.00,0.00,Zero-value payout',
      'l-2,ORD-9602,2026-08-02,-500.00,0.00,0.00,0.00,0.00,0.00,-500.00,Reversal',
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: {},
    },
  },
  {
    name: 'amounts-beyond-float-precision',
    domain: 'settlement',
    category: 'hostile value',
    what: 'A figure larger than `Number.MAX_SAFE_INTEGER` in paise alongside a one-paise figure. Both survive exactly, which is the whole reason money is a bigint.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ORD-9701,2026-08-01,99999999999999.99,0.00,0.00,0.00,0.00,0.00,99999999999999.99,Very large payout',
      's-2,ORD-9702,2026-08-02,0.01,0.00,0.00,0.00,0.00,0.00,0.01,One paise',
    ),
    ledgerCsv: csv(
      S_HEADER,
      'l-1,ORD-9701,2026-08-01,99999999999999.99,0.00,0.00,0.00,0.00,0.00,99999999999999.99,Very large payout',
      'l-2,ORD-9702,2026-08-02,0.01,0.00,0.00,0.00,0.00,0.00,0.01,One paise',
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: {},
    },
  },
  {
    name: 'excess-decimal-precision',
    domain: 'settlement',
    category: 'hostile value',
    what: 'A net carrying three decimal places. It is rejected rather than rounded: a silently rounded paise becomes a discrepancy the engine later reports with no way to trace it back to the parse.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ORD-9801,2026-08-01,1000.00,20.00,10.00,30.00,0.00,0.00,1234.567,Sub-paise net',
      cleanSettlementRow('s-2', 'ORD-9802', '2026-08-02'),
    ),
    ledgerCsv: csv(
      S_HEADER,
      cleanSettlementRow('l-1', 'ORD-9801', '2026-08-01'),
      cleanSettlementRow('l-2', 'ORD-9802', '2026-08-02'),
    ),
    expect: {
      sourceRecords: 1,
      sourceErrors: 1,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 1,
      exceptions: { UNMATCHED_LEDGER: 1 },
    },
  },
  {
    name: 'currency-formatted-amounts',
    domain: 'settlement',
    category: 'hostile value',
    what: 'Amounts as a spreadsheet renders them: a rupee symbol, thousands separators, and an accounting-style parenthesised negative. All three parse to the same figures the plain ledger states.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ORD-9901,2026-08-01,"₹1,264.50",20.00,10.00,₹30.00,0.00,0.00,"₹1,234.50",Formatted payout',
      's-2,ORD-9902,2026-08-02,(500.00),0.00,0.00,0.00,0.00,0.00,(500.00),Parenthesised reversal',
    ),
    ledgerCsv: csv(
      S_HEADER,
      'l-1,ORD-9901,2026-08-01,1264.50,20.00,10.00,30.00,0.00,0.00,1234.50,Formatted payout',
      'l-2,ORD-9902,2026-08-02,-500.00,0.00,0.00,0.00,0.00,0.00,-500.00,Parenthesised reversal',
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: {},
    },
  },
  {
    name: 'reference-oddities',
    domain: 'settlement',
    category: 'hostile value',
    what: 'An empty reference and a whitespace-only one are rejected — an absent reference is not evidence and must never match another blank. A reference differing only in case and punctuation, and one carrying non-Latin characters and an emoji, both normalise onto their ledger counterpart and match.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ord / 9a01,2026-08-01,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,Punctuated reference',
      's-2,,2026-08-02,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,Missing reference',
      's-3,   ,2026-08-03,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,Whitespace reference',
      's-4,订单-9A02-🚀,2026-08-04,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,Non-Latin reference',
    ),
    ledgerCsv: csv(
      S_HEADER,
      cleanSettlementRow('l-1', 'ORD-9A01', '2026-08-01'),
      cleanSettlementRow('l-4', '9A02', '2026-08-04'),
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 2,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: {},
    },
  },
  {
    name: 'long-quoted-description',
    domain: 'settlement',
    category: 'hostile value',
    what: 'A description of some hundreds of characters containing commas and doubled quotes, quoted as RFC 4180 requires. It must round-trip without disturbing the columns after it.',
    sourceCsv: csv(
      S_HEADER,
      `s-1,ORD-9B01,2026-08-01,1000.00,20.00,10.00,30.00,0.00,0.00,970.00,"${LONG_DESCRIPTION}"`,
    ),
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9B01', '2026-08-01')),
    expect: {
      sourceRecords: 1,
      sourceErrors: 0,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 1,
      exceptions: {},
    },
  },

  // --- Engine scenarios -----------------------------------------------------
  {
    name: 'duplicate-references',
    domain: 'settlement',
    category: 'engine scenario',
    what: 'The same reference and amount reported twice against one ledger entry. Neither copy is preferable to the other, so the engine refuses to choose and reports the ambiguity instead of matching.',
    sourceCsv: csv(
      S_HEADER,
      cleanSettlementRow('s-1', 'ORD-9C01', '2026-08-01'),
      cleanSettlementRow('s-2', 'ORD-9C01', '2026-08-01'),
    ),
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9C01', '2026-08-01')),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { DUPLICATE_SUSPECTED: 1 },
    },
  },
  {
    name: 'single-pair',
    domain: 'settlement',
    category: 'engine scenario',
    what: 'The smallest dataset that can reconcile at all: one record each side. Guards against any tier that quietly assumes a population.',
    sourceCsv: csv(S_HEADER, cleanSettlementRow('s-1', 'ORD-9D01', '2026-08-01')),
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9D01', '2026-08-01')),
    expect: {
      sourceRecords: 1,
      sourceErrors: 0,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 1,
      exceptions: {},
    },
  },
  {
    name: 'no-overlap',
    domain: 'settlement',
    category: 'engine scenario',
    what: 'Two files with nothing in common — different references, amounts, and months. Every record on both sides is unmatched, and no tier may invent a pairing out of the absence of evidence.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ORD-9E01,2026-08-01,120.00,5.00,3.00,8.00,0.00,0.00,112.00,Payout ORD-9E01',
      's-2,ORD-9E02,2026-08-02,230.00,5.00,3.00,8.00,0.00,0.00,222.00,Payout ORD-9E02',
    ),
    ledgerCsv: csv(
      S_HEADER,
      'l-1,VCH-70001,2026-01-05,785.00,5.00,3.00,8.00,0.00,0.00,777.00,Voucher 70001',
      'l-2,VCH-70002,2026-01-06,896.00,5.00,3.00,8.00,0.00,0.00,888.00,Voucher 70002',
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { UNMATCHED_SOURCE: 2, UNMATCHED_LEDGER: 2 },
    },
  },
  {
    name: 'calendar-boundaries',
    domain: 'settlement',
    category: 'engine scenario',
    what: 'A real leap day (2028-02-29), a fake one (2027-02-29, rejected rather than rolled forward into March), and a pair straddling a year boundary one day apart — which is inside the window and therefore not a timing difference.',
    sourceCsv: csv(
      S_HEADER,
      cleanSettlementRow('s-1', 'ORD-9F01', '2028-02-29'),
      cleanSettlementRow('s-2', 'ORD-9F02', '2027-02-29'),
      cleanSettlementRow('s-3', 'ORD-9F03', '2026-12-31'),
    ),
    ledgerCsv: csv(
      S_HEADER,
      cleanSettlementRow('l-1', 'ORD-9F01', '2028-02-29'),
      cleanSettlementRow('l-3', 'ORD-9F03', '2027-01-01'),
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 1,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: {},
    },
  },
  {
    name: 'timing-outside-window',
    domain: 'settlement',
    category: 'engine scenario',
    what: 'Identical records eleven days apart. The pair still matches — the money is accounted for — and the lateness is reported as an advisory alongside the match rather than as two orphans.',
    sourceCsv: csv(S_HEADER, cleanSettlementRow('s-1', 'ORD-9G01', '2026-08-01')),
    ledgerCsv: csv(S_HEADER, cleanSettlementRow('l-1', 'ORD-9G01', '2026-08-12')),
    expect: {
      sourceRecords: 1,
      sourceErrors: 0,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 1,
      exceptions: { TIMING_DIFFERENCE: 1 },
    },
  },

  // --- Domain quirks --------------------------------------------------------
  {
    name: 'fees-exceed-gross',
    domain: 'settlement',
    category: 'domain quirk',
    what: 'A payout whose fees exceed its gross, leaving a negative net — arithmetically consistent, so no finding — beside one whose stated net is simply wrong. Only the second is a fee variance.',
    sourceCsv: csv(
      S_HEADER,
      's-1,ORD-9H01,2026-08-01,100.00,100.00,50.00,150.00,0.00,0.00,-50.00,Fees exceed gross',
      's-2,ORD-9H02,2026-08-02,1000.00,20.00,10.00,30.00,0.00,0.00,900.00,Net does not follow',
    ),
    ledgerCsv: csv(
      S_HEADER,
      'l-1,ORD-9H01,2026-08-01,100.00,100.00,50.00,150.00,0.00,0.00,-50.00,Fees exceed gross',
      'l-2,ORD-9H02,2026-08-02,1000.00,20.00,10.00,30.00,0.00,0.00,900.00,Net does not follow',
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: { FEE_VARIANCE: 1 },
    },
  },
  {
    name: 'minimal-columns',
    domain: 'settlement',
    category: 'domain quirk',
    what: 'A settlement export carrying only the three required columns. It parses and matches, but every source row raises a fee variance: an absent `gross` reads as zero, so the settlement identity cannot hold. Worth knowing before someone uploads a trimmed export and reads a queue of findings that are artefacts of the file, not the data.',
    sourceCsv: csv(
      'order_ref,txn_date,net',
      'ORD-9J01,2026-08-01,970.00',
      'ORD-9J02,2026-08-02,1250.00',
    ),
    ledgerCsv: csv(
      'order_ref,txn_date,net',
      'ORD-9J01,2026-08-01,970.00',
      'ORD-9J02,2026-08-02,1250.00',
    ),
    expect: {
      sourceRecords: 2,
      sourceErrors: 0,
      ledgerRecords: 2,
      ledgerErrors: 0,
      matches: 2,
      exceptions: { FEE_VARIANCE: 2 },
    },
  },
  {
    name: 'bank-direction-oddities',
    domain: 'bank',
    category: 'domain quirk',
    what: 'A statement row with both a debit and a credit, and one with neither, are both rejected — direction must be unambiguous. A debit written as a negative number flips to a credit, because the adapter negates what the debit column states; a zero-value debit is kept as a zero-amount record rather than collapsing into "no direction".',
    sourceCsv: csv(
      B_HEADER,
      'b-1,2026-08-01,NEFT/ACME/UTR90001,UTR90001,500.00,500.00,10000.00,Both directions',
      'b-2,2026-08-02,NEFT/ACME/UTR90002,UTR90002,,,10000.00,Neither direction',
      'b-3,2026-08-03,NEFT/ACME/UTR90003,UTR90003,-500.00,,10000.00,Negative debit',
      'b-4,2026-08-04,NEFT/ACME/UTR90004,UTR90004,0.00,,10000.00,Zero-value debit',
      'b-5,2026-08-05,NEFT/ACME/UTR90005,UTR90005,,3222.56,10000.00,Ordinary credit',
    ),
    ledgerCsv: csv(
      B_HEADER,
      'l-3,2026-08-03,NEFT/ACME/UTR90003,UTR90003,,500.00,10000.00,Negative debit',
      'l-4,2026-08-04,NEFT/ACME/UTR90004,UTR90004,0.00,,10000.00,Zero-value debit',
      'l-5,2026-08-05,NEFT/ACME/UTR90005,UTR90005,,3222.56,10000.00,Ordinary credit',
    ),
    expect: {
      sourceRecords: 3,
      sourceErrors: 2,
      ledgerRecords: 3,
      ledgerErrors: 0,
      matches: 3,
      exceptions: {},
    },
  },
  {
    name: 'bank-signed-amount-column',
    domain: 'bank',
    category: 'domain quirk',
    what: 'A statement exporting one signed `amount` column instead of separate debit and credit columns. Unsupported by design, and it must fail on its shape with the missing columns named rather than parse into nothing.',
    sourceCsv: csv(
      'record_id,txn_date,narration,reference,amount,balance',
      'b-1,2026-08-01,NEFT/ACME/UTR90101,UTR90101,-500.00,10000.00',
    ),
    ledgerCsv: csv(
      B_HEADER,
      'l-1,2026-08-01,NEFT/ACME/UTR90101,UTR90101,500.00,,10000.00,Payment out',
    ),
    expect: {
      sourceRecords: 0,
      sourceErrors: 1,
      ledgerRecords: 1,
      ledgerErrors: 0,
      matches: 0,
      exceptions: { UNMATCHED_LEDGER: 1 },
    },
  },
];
