/**
 * Stage 1 — document extraction.
 *
 * This is where the system uses AI, and where it is most careful about it.
 * Reading a settlement statement out of a scan is genuinely hard for rules and
 * genuinely easy for a multimodal model; deciding whether the result is
 * trustworthy is not delegated to the model at all.
 *
 * Two constraints do that work:
 *
 * 1. **Amounts are extracted as strings, never numbers.** A JSON number is an
 *    IEEE-754 double, so letting the model return `1250.5` would reintroduce
 *    floating point at the one boundary the branded money type cannot guard.
 *    Strings are parsed with `parseMinor`, which rejects anything it cannot
 *    represent exactly.
 * 2. **Every field carries a confidence, and the threshold is enforced here.**
 *    A record with any field below the threshold is marked `needs_review` and
 *    does not reach the ledger until a human confirms it.
 *
 * @see docs/ARCHITECTURE.md §1 — AI trust boundaries
 * @see docs/REQUIREMENTS.md FR-4
 * @module
 */

import { Type, type Schema } from '@google/genai';
import { createGeminiClient, geminiModelId } from './gemini';

/**
 * Confidence below which a field is quarantined.
 *
 * The number itself matters less than the fact that something is quarantined at
 * all: the gate is what makes a bad scan degrade into a review item rather than
 * a wrong figure entering reconciliation.
 */
export const CONFIDENCE_THRESHOLD = 0.85;

/** Fields extracted from a settlement statement. */
export const EXTRACTED_FIELDS = [
  'reference',
  'date',
  'gross',
  'fees',
  'refunds',
  'chargebacks',
  'net',
] as const;

/** Name of an extracted field. */
export type ExtractedFieldName = (typeof EXTRACTED_FIELDS)[number];

/** One extracted value with the model's confidence in it. */
export interface ExtractedField {
  /** The value exactly as read, unparsed. */
  readonly value: string;
  /** The model's confidence in `[0, 1]`. */
  readonly confidence: number;
}

/** What became of one extraction attempt. */
export type ExtractionStatus = 'confirmed' | 'needs_review' | 'failed';

/** The outcome of extracting one document. */
export interface ExtractionOutcome {
  readonly status: ExtractionStatus;
  readonly fields: Readonly<Partial<Record<ExtractedFieldName, ExtractedField>>>;
  /** Lowest confidence across all fields, or `null` when extraction failed. */
  readonly minConfidence: number | null;
  /** Which model produced this, recorded so quality shifts are attributable. */
  readonly modelId: string;
  /** Fields that fell below the threshold. */
  readonly lowConfidenceFields: readonly ExtractedFieldName[];
  /** Populated when `status` is `failed`. */
  readonly error?: string;
}

/** Schema for one field: the value as text, plus a confidence. */
function fieldSchema(description: string): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      value: { type: Type.STRING, description },
      confidence: {
        type: Type.NUMBER,
        description:
          'How legible this specific value was, from 0 to 1. Report low confidence when ' +
          'the text is blurred, cut off, ambiguous, or absent — do not guess a plausible value.',
      },
    },
    required: ['value', 'confidence'],
  };
}

/**
 * The response schema.
 *
 * Every monetary field is typed `STRING`. This is deliberate and load-bearing:
 * a `NUMBER` here would be parsed as a double and silently lose exactness on
 * values this system is required to compare precisely.
 */
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reference: fieldSchema('The order or payout reference, exactly as printed.'),
    date: fieldSchema('The settlement date, normalised to YYYY-MM-DD.'),
    gross: fieldSchema('Gross sale value as digits only, e.g. "1250.00". No currency symbol.'),
    fees: fieldSchema('Total fees or deductions as digits only. "0.00" if none are shown.'),
    refunds: fieldSchema('Refunds deducted, as digits only. "0.00" if none are shown.'),
    chargebacks: fieldSchema('Chargebacks deducted, as digits only. "0.00" if none are shown.'),
    net: fieldSchema('Net amount paid out, as digits only.'),
  },
  required: [...EXTRACTED_FIELDS],
  propertyOrdering: [...EXTRACTED_FIELDS],
};

/** Instruction given with every document. */
const SYSTEM_INSTRUCTION = `You read payment settlement statements and remittance advices.

Extract only what is printed. Never infer, compute, or complete a value that is not
legible — if a figure is cut off, blurred, or missing, return your best reading of
what is visible and a LOW confidence for that field.

Confidence must reflect legibility of that specific value, not your general certainty
about settlement documents. A crisp figure warrants high confidence; a smudged or
partially obscured one does not, even when you can guess it from the arithmetic.

Return amounts as plain digits with two decimal places and no currency symbol,
thousands separator, or sign.`;

/**
 * Extracts settlement fields from a document.
 *
 * @param document.data - Raw file bytes.
 * @param document.mimeType - The document's media type, e.g. `application/pdf`.
 * @returns The extracted fields and whether they cleared the confidence gate.
 *   Never throws for a model or network failure: a `failed` outcome is returned
 *   instead, so the caller can surface it without the ledger being touched.
 */
export async function extractSettlementDocument(document: {
  readonly data: Uint8Array;
  readonly mimeType: string;
}): Promise<ExtractionOutcome> {
  const modelId = geminiModelId();

  try {
    const client = createGeminiClient();
    const response = await client.models.generateContent({
      model: modelId,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: document.mimeType,
                data: Buffer.from(document.data).toString('base64'),
              },
            },
            { text: 'Extract the settlement fields from this document.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Deterministic-leaning: the same document should read the same way
        // twice. The model is not obliged to honour this, which is one reason
        // the confidence gate exists rather than trusting a single pass.
        temperature: 0,
      },
    });

    const text = response.text;
    if (text === undefined || text.trim().length === 0) {
      return failure(modelId, 'The model returned an empty response.');
    }

    return interpret(modelId, text);
  } catch (cause) {
    return failure(modelId, cause instanceof Error ? cause.message : String(cause));
  }
}

/** Builds a failed outcome. Nothing reaches the ledger from here. */
function failure(modelId: string, error: string): ExtractionOutcome {
  return {
    status: 'failed',
    fields: {},
    minConfidence: null,
    modelId,
    lowConfidenceFields: [],
    error,
  };
}

/**
 * Validates the model's JSON and applies the confidence gate.
 *
 * The schema constrains the response shape, but a schema is a request rather
 * than a guarantee — the payload is still checked field by field before any of
 * it is trusted.
 */
function interpret(modelId: string, text: string): ExtractionOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure(modelId, 'The model returned text that was not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object') {
    return failure(modelId, 'The model returned JSON that was not an object.');
  }

  const source = parsed as Record<string, unknown>;
  const fields: Partial<Record<ExtractedFieldName, ExtractedField>> = {};
  const lowConfidenceFields: ExtractedFieldName[] = [];
  let minConfidence = 1;

  for (const name of EXTRACTED_FIELDS) {
    const raw = source[name];
    if (raw === null || typeof raw !== 'object') {
      return failure(modelId, `The model omitted the "${name}" field.`);
    }
    const entry = raw as { value?: unknown; confidence?: unknown };
    if (typeof entry.value !== 'string' || typeof entry.confidence !== 'number') {
      return failure(modelId, `The "${name}" field did not have a value and a confidence.`);
    }

    // A confidence outside [0,1] is meaningless; clamping keeps the gate
    // conservative rather than letting an out-of-range value wave a field through.
    const confidence = Math.min(1, Math.max(0, entry.confidence));
    fields[name] = { value: entry.value.trim(), confidence };
    if (confidence < minConfidence) minConfidence = confidence;
    if (confidence < CONFIDENCE_THRESHOLD) lowConfidenceFields.push(name);
  }

  return {
    status: lowConfidenceFields.length > 0 ? 'needs_review' : 'confirmed',
    fields,
    minConfidence,
    modelId,
    lowConfidenceFields,
  };
}
