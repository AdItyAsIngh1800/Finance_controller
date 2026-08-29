/**
 * A reconciliation data source backed by generated fixtures.
 *
 * Exists so the agent's grounding behaviour can be verified against the real
 * model without a database or a signed-in session. It returns the same shapes
 * the Supabase-backed source does, so a question answered correctly here is
 * answered correctly in production.
 *
 * This is verification scaffolding, not a production path — nothing in the
 * application wires it up.
 *
 * @see docs/ROADMAP.md §5 — risk R-5
 * @module
 */

import { formatMinor } from '../core/money';
import type { EvidenceLine, NormalizedRecord, ReconResult, SettlementDetail } from '../core/types';
import type { ReconDataSource } from './agent-tools';

/** Renders an evidence line with amounts already formatted. */
function presentEvidence(line: EvidenceLine): Record<string, string> {
  return {
    label: line.label,
    ...(line.sourceMinor === undefined ? {} : { source: formatMinor(line.sourceMinor) }),
    ...(line.ledgerMinor === undefined ? {} : { ledger: formatMinor(line.ledgerMinor) }),
    ...(line.note === undefined ? {} : { note: line.note }),
  };
}

/**
 * Builds a data source over an in-memory reconciliation result.
 *
 * Amounts are formatted to strings before they leave this module. The agent is
 * required to quote figures rather than compute them, and handing it formatted
 * text rather than raw numbers removes the temptation to do arithmetic on them.
 *
 * @param result - Output of the reconciliation engine.
 * @param source - The source-side records reconciled.
 * @param ledger - The ledger-side records reconciled.
 * @returns A read-only data source for the agent.
 */
export function createFixtureDataSource(
  result: ReconResult,
  source: readonly NormalizedRecord[],
  ledger: readonly NormalizedRecord[],
): ReconDataSource {
  const byId = new Map<string, NormalizedRecord>();
  for (const record of [...source, ...ledger]) byId.set(record.id, record);

  const exceptionsWithIds = result.exceptions.map((exception, index) => ({
    id: `exc-${index + 1}`,
    exception,
  }));

  const referenceOf = (ids: readonly string[]): string =>
    ids.map((id) => byId.get(id)?.externalRef).find((ref) => ref !== undefined) ?? '';

  return {
    async getReconciliationSummary() {
      // Severity is included deliberately. Without it the agent cannot answer
      // "which exceptions matter most" — the question a controller opening this
      // screen is actually asking — and correctly refuses instead. The high/low
      // split is the queue's central distinction, so the agent needs it.
      const bySeverity: Record<string, number> = {};
      for (const exception of result.exceptions) {
        bySeverity[exception.severity] = (bySeverity[exception.severity] ?? 0) + 1;
      }

      return {
        matchRate: `${(result.stats.matchRate * 100).toFixed(1)}%`,
        sourceRecords: result.stats.sourceCount,
        ledgerRecords: result.stats.ledgerCount,
        matchedRecords: result.stats.matchedCount,
        exceptions: result.stats.exceptionCount,
        matchesByTier: result.stats.matchesByTier,
        exceptionsByType: result.stats.exceptionsByType,
        exceptionsBySeverity: bySeverity,
        severityMeaning: {
          high: 'Money is unaccounted for.',
          medium: 'A human decision is required.',
          low: 'The discrepancy is explained — the money is accounted for.',
        },
      };
    },

    async getExceptionDetail(exceptionId: string) {
      const found = exceptionsWithIds.find((entry) => entry.id === exceptionId);
      if (found === undefined) return { error: `No exception with id "${exceptionId}".` };
      return {
        id: found.id,
        type: found.exception.type,
        severity: found.exception.severity,
        reference: referenceOf([
          ...found.exception.sourceRecordIds,
          ...found.exception.ledgerEntryIds,
        ]),
        statedReason: found.exception.statedReason,
        evidence: found.exception.evidence.map(presentEvidence),
        suggestedAction: found.exception.suggestedAction ?? null,
      };
    },

    async getSettlementBreakdown(reference: string) {
      const wanted = reference.trim().toUpperCase();
      const present = (record: NormalizedRecord | undefined) => {
        if (record === undefined || record.detail.kind !== 'settlement') return null;
        const detail: SettlementDetail = record.detail;
        return {
          reference: record.externalRef,
          date: record.date,
          gross: formatMinor(detail.grossMinor),
          fees: formatMinor(detail.feesMinor),
          feeLines: detail.feeLines.map((line) => ({
            label: line.label,
            amount: formatMinor(line.amountMinor),
          })),
          refunds: formatMinor(detail.refundsMinor),
          chargebacks: formatMinor(detail.chargebacksMinor),
          net: formatMinor(detail.netMinor),
        };
      };

      const sourceSide = present(
        source.find((record) => record.externalRef.toUpperCase() === wanted),
      );
      const ledgerSide = present(
        ledger.find((record) => record.externalRef.toUpperCase() === wanted),
      );

      if (sourceSide === null && ledgerSide === null) {
        return { error: `No settlement record found for "${reference}".` };
      }
      return { source: sourceSide, ledger: ledgerSide };
    },

    async findRecords(query: string) {
      const needle = query.trim().toUpperCase();
      if (needle.length === 0) return { error: 'A search term is required.' };

      const matchesRecord = (record: NormalizedRecord): boolean =>
        record.externalRef.toUpperCase().includes(needle) ||
        record.date.includes(needle) ||
        formatMinor(record.amountMinor).includes(needle);

      return {
        records: [...source, ...ledger]
          .filter(matchesRecord)
          .slice(0, 10)
          .map((record) => ({
            id: record.id,
            side: record.side,
            reference: record.externalRef,
            date: record.date,
            amount: formatMinor(record.amountMinor),
          })),
        exceptions: exceptionsWithIds
          .filter((entry) => {
            const ids = [...entry.exception.sourceRecordIds, ...entry.exception.ledgerEntryIds];
            return (
              referenceOf(ids).toUpperCase().includes(needle) ||
              entry.exception.type.includes(needle)
            );
          })
          .slice(0, 10)
          .map((entry) => ({
            id: entry.id,
            type: entry.exception.type,
            severity: entry.exception.severity,
            reference: referenceOf([
              ...entry.exception.sourceRecordIds,
              ...entry.exception.ledgerEntryIds,
            ]),
            statedReason: entry.exception.statedReason,
          })),
      };
    },
  };
}
