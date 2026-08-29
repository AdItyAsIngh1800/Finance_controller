/**
 * CSV serialization of generated datasets.
 *
 * The engine consumes {@link NormalizedRecord} directly, so these files exist
 * for the *ingestion* path: they are what a user uploads and what the domain
 * adapters parse back. Emitting them in domain-native column shapes — rather
 * than dumping the normalized form — means the adapters are exercised against
 * realistic input rather than against the generator's internal representation.
 *
 * Amounts are written as plain decimal strings, so parsing them back is forced
 * through `parseMinor` and the money path is never re-entered via a float.
 *
 * @module
 */

import { toDecimalString } from '../money';
import type { BankDetail, NormalizedRecord, SettlementDetail } from '../types';

/**
 * Escapes one CSV field.
 *
 * Wraps in double quotes when the value contains a comma, quote, or newline,
 * doubling any embedded quotes. Generated narrations contain `/` and spaces but
 * could legitimately contain commas, so this is applied unconditionally rather
 * than assumed unnecessary.
 *
 * @param value - The raw field value.
 * @returns The field, quoted and escaped if required.
 */
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Joins rows into CSV text.
 *
 * @param rows - Header row followed by data rows.
 * @returns CSV text with a trailing newline.
 */
function toCsv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.map(escapeField).join(',')).join('\n')}\n`;
}

/**
 * Serializes settlement records to a processor-style CSV.
 *
 * `fees_total` is emitted alongside the itemised fee columns deliberately. A
 * planted `FEE_VARIANCE` inflates the stated total *without* touching the line
 * items, which is precisely the anomaly the engine must detect — deriving the
 * total from the items on the way out would erase it before the engine ever saw
 * the file.
 *
 * @param records - Settlement-domain records from one side.
 * @returns CSV text.
 */
export function settlementToCsv(records: readonly NormalizedRecord[]): string {
  const header = [
    'record_id',
    'order_ref',
    'txn_date',
    'gross',
    'commission',
    'gateway_fee',
    'fees_total',
    'refunds',
    'chargebacks',
    'net',
    'description',
  ];

  const rows = records.map((record) => {
    const detail = record.detail as SettlementDetail;
    const commission = detail.feeLines.find((line) => line.label === 'Platform commission');
    const gateway = detail.feeLines.find((line) => line.label === 'Payment gateway');
    return [
      record.id,
      record.externalRef,
      record.date,
      toDecimalString(detail.grossMinor),
      commission ? toDecimalString(commission.amountMinor) : '0.00',
      gateway ? toDecimalString(gateway.amountMinor) : '0.00',
      toDecimalString(detail.feesMinor),
      toDecimalString(detail.refundsMinor),
      toDecimalString(detail.chargebacksMinor),
      toDecimalString(record.amountMinor),
      record.description,
    ];
  });

  return toCsv([header, ...rows]);
}

/**
 * Serializes bank records to a statement-style CSV.
 *
 * Direction is expressed the way a real statement does — separate `debit` and
 * `credit` columns, each blank when not applicable — rather than as a signed
 * amount. The adapter is responsible for folding these back into a sign, which
 * is exactly the conversion it will have to perform on real exports.
 *
 * The `reference` column is written from `externalRef` and nowhere else. An
 * earlier version wrote it from a duplicate held in the detail payload, which
 * went stale the moment reference variance rewrote one and not the other — and
 * the round-trip then silently restored the original reference, letting the
 * exact-reference tier reclaim pairs that should have fallen through to a
 * weaker one.
 *
 * @param records - Bank-domain records from one side.
 * @returns CSV text.
 */
export function bankToCsv(records: readonly NormalizedRecord[]): string {
  const header = [
    'record_id',
    'txn_date',
    'narration',
    'reference',
    'debit',
    'credit',
    'balance',
    'description',
  ];

  const rows = records.map((record) => {
    const detail = record.detail as BankDetail;
    const isDebit = record.amountMinor < 0n;
    const magnitude = toDecimalString(
      (record.amountMinor < 0n ? -record.amountMinor : record.amountMinor) as typeof record.amountMinor,
    );
    return [
      record.id,
      record.date,
      detail.narration,
      record.externalRef,
      isDebit ? magnitude : '',
      isDebit ? '' : magnitude,
      detail.balanceMinor === undefined ? '' : toDecimalString(detail.balanceMinor),
      record.description,
    ];
  });

  return toCsv([header, ...rows]);
}

/**
 * Serializes records using the column shape for their domain.
 *
 * @param domain - Which domain the records belong to.
 * @param records - Records from one side of a dataset.
 * @returns CSV text in the domain-native shape.
 */
export function recordsToCsv(
  domain: 'settlement' | 'bank',
  records: readonly NormalizedRecord[],
): string {
  return domain === 'settlement' ? settlementToCsv(records) : bankToCsv(records);
}
