/**
 * The agent's read-only function surface.
 *
 * Stage 3 is allowed to use a model because of what this file does *not*
 * contain. There are four functions, all of them reads, and none of them
 * computes anything: every figure the agent can utter was produced by the
 * deterministic engine and is merely being fetched.
 *
 * Data arrives through {@link ReconDataSource} rather than a database client, so
 * the grounding behaviour can be exercised against fixtures without a signed-in
 * session — which is what makes risk R-5 ("agent states an ungrounded figure")
 * testable at all.
 *
 * @see docs/ARCHITECTURE.md §1 — how Stage 3 is constrained
 * @see docs/REQUIREMENTS.md FR-7.2, FR-7.3
 * @module
 */

import { Type, type FunctionDeclaration } from '@google/genai';

/**
 * Everything the agent is permitted to know.
 *
 * Every method is a read. There is deliberately no write, no aggregate, and no
 * "compute" — an agent that could derive a figure would be producing evidence
 * rather than reporting it.
 */
export interface ReconDataSource {
  /** Headline figures for a run: match rate, counts, tier breakdown. */
  getReconciliationSummary(): Promise<unknown>;
  /** One exception in full, including its evidence lines. */
  getExceptionDetail(exceptionId: string): Promise<unknown>;
  /** The gross → fees → refunds → chargebacks → net breakdown for a record. */
  getSettlementBreakdown(reference: string): Promise<unknown>;
  /** Records and exceptions matching a reference, amount, or date. */
  findRecords(query: string): Promise<unknown>;
}

/** The declarations handed to the model. */
export const AGENT_FUNCTIONS: readonly FunctionDeclaration[] = [
  {
    name: 'getReconciliationSummary',
    description:
      'Overall results of this reconciliation run: match rate, how many records matched, ' +
      'counts of each exception type, and how many matches each tier produced. ' +
      'Use this for questions about the run as a whole.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getExceptionDetail',
    description:
      'Full detail of one exception, including its stated reason and the evidence lines ' +
      'behind it. Use after findRecords has identified which exception is relevant.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        exceptionId: { type: Type.STRING, description: 'The exception identifier.' },
      },
      required: ['exceptionId'],
    },
  },
  {
    name: 'getSettlementBreakdown',
    description:
      'The settlement arithmetic for one record: gross, each fee line, refunds, chargebacks ' +
      'and net, on both the source and ledger sides. Use this to explain why an amount differs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reference: {
          type: Type.STRING,
          description: 'The order or payout reference, for example "ORD-4471".',
        },
      },
      required: ['reference'],
    },
  },
  {
    name: 'findRecords',
    description:
      'Search this run for records and exceptions by reference, amount, or date. ' +
      'Use this first when the question names something specific.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'A reference, amount, or date to search for.',
        },
      },
      required: ['query'],
    },
  },
];

/**
 * Dispatches one function call against the data source.
 *
 * An unknown function name returns an error payload rather than throwing: the
 * model occasionally invents a call, and the correct response is to tell it the
 * function does not exist so it can recover, not to fail the request.
 *
 * @param source - The data source to read from.
 * @param name - Function name as requested by the model.
 * @param args - Arguments as supplied by the model.
 * @returns The function's result, or an error payload.
 */
export async function callAgentFunction(
  source: ReconDataSource,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'getReconciliationSummary':
      return source.getReconciliationSummary();
    case 'getExceptionDetail':
      return source.getExceptionDetail(String(args.exceptionId ?? ''));
    case 'getSettlementBreakdown':
      return source.getSettlementBreakdown(String(args.reference ?? ''));
    case 'findRecords':
      return source.findRecords(String(args.query ?? ''));
    default:
      return { error: `No function named "${name}" exists.` };
  }
}
