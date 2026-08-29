/**
 * Renders settlement records as printable statement HTML.
 *
 * These documents feed Stage 1: because they are generated from records whose
 * values are already known, extraction accuracy can be *measured* against
 * ground truth rather than eyeballed.
 *
 * Deliberately laid out like a real remittance advice — a header block, a
 * reference table, and a deduction breakdown that sums to a net figure — rather
 * than as a clean data dump. A model reading a tidy key-value list proves very
 * little about whether it can read a statement.
 *
 * @see docs/EVALUATION.md §2.2 — rendered documents for Stage 1
 * @module
 */

import { absMinor, formatMinor, type Minor } from '../money';
import type { NormalizedRecord, SettlementDetail } from '../types';

/** Formats an amount the way a printed statement sets it, with a space after the symbol. */
function money(amount: Minor): string {
  return formatMinor(amount).replace('₹', '₹ ');
}

/** Escapes text for safe inclusion in HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a remittance-advice HTML document for one settlement record.
 *
 * @param record - A settlement-domain record.
 * @param options.processor - Name printed as the paying party.
 * @returns A complete standalone HTML document.
 * @throws {TypeError} If the record is not a settlement record.
 */
export function settlementStatementHtml(
  record: NormalizedRecord,
  options: { readonly processor?: string } = {},
): string {
  if (record.detail.kind !== 'settlement') {
    throw new TypeError(`Expected a settlement record, received "${record.detail.kind}".`);
  }
  const detail: SettlementDetail = record.detail;
  const processor = options.processor ?? 'Northwind Payments';

  // Deductions print as positive figures in a "less" column, wrapped in
  // parentheses — which is how a remittance advice actually reads.
  const deductionRow = (label: string, amount: Minor): string =>
    amount === 0n
      ? ''
      : `<tr><td>${escapeHtml(label)}</td><td class="num">(${money(absMinor(amount))})</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Remittance advice ${escapeHtml(record.externalRef)}</title>
<style>
  @page { size: A5; margin: 14mm; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; }
  .masthead { display: flex; justify-content: space-between; align-items: baseline;
              border-bottom: 2px solid #111; padding-bottom: 6px; }
  .masthead h1 { font-size: 13pt; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
  .masthead .doc { font-size: 9pt; color: #555; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 16px; margin: 14px 0 18px; font-size: 10pt; }
  dt { color: #555; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em;
       color: #555; border-bottom: 1px solid #999; padding-bottom: 3px; }
  td { padding: 3px 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total td { border-top: 1px solid #999; padding-top: 6px; font-weight: 600; }
  .net td { border-top: 3px double #111; padding-top: 6px; font-size: 12pt; font-weight: 700; }
  footer { margin-top: 22px; font-size: 8pt; color: #777; border-top: 1px solid #ddd; padding-top: 6px; }
</style></head>
<body>
  <div class="masthead">
    <h1>${escapeHtml(processor)}</h1>
    <span class="doc">Remittance advice</span>
  </div>

  <dl>
    <dt>Order reference</dt><dd>${escapeHtml(record.externalRef)}</dd>
    <dt>Settlement date</dt><dd>${escapeHtml(record.date)}</dd>
    <dt>Description</dt><dd>${escapeHtml(record.description)}</dd>
  </dl>

  <table>
    <thead><tr><th>Particulars</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      <tr><td>Gross sale value</td><td class="num">${money(detail.grossMinor)}</td></tr>
      ${detail.feeLines.map((line) => deductionRow(line.label, line.amountMinor)).join('')}
      ${deductionRow('Refunds', detail.refundsMinor)}
      ${deductionRow('Chargebacks', detail.chargebacksMinor)}
      <tr class="total"><td>Total deductions</td><td class="num">(${money(detail.feesMinor)} fees)</td></tr>
      <tr class="net"><td>Net amount paid</td><td class="num">${money(detail.netMinor)}</td></tr>
    </tbody>
  </table>

  <footer>
    Computer generated advice. Figures in Indian rupees.
  </footer>
</body></html>`;
}
