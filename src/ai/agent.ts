/**
 * Stage 3 — the grounded Q&A agent.
 *
 * The model is used here for what it is good at: understanding a question and
 * phrasing an answer. It is not used to decide anything. Every figure in an
 * answer must have arrived from a function result produced by the deterministic
 * engine — the agent retrieves and phrases, it never computes.
 *
 * Three things enforce that, and none of them is a hopeful instruction alone:
 *
 * 1. The function surface is read-only and contains no aggregate or derived
 *    value, so there is nothing to compute *with*.
 * 2. The system instruction states the constraint plainly, including what to do
 *    when the data cannot answer — say so.
 * 3. Every call and its arguments are returned alongside the answer and rendered
 *    in the interface, so a reader can check the answer against its sources
 *    instead of trusting it.
 *
 * The third is the important one. An ungrounded answer is a failure that *looks*
 * like success, so the defence has to be something a human can inspect.
 *
 * @see docs/ARCHITECTURE.md §1 — how Stage 3 is constrained
 * @see docs/ROADMAP.md §5 — risk R-5
 * @module
 */

import type { Content, Part } from '@google/genai';
import { AGENT_FUNCTIONS, callAgentFunction, type ReconDataSource } from './agent-tools';
import { createGeminiClient, geminiModelId } from './gemini';

/**
 * Ceiling on function-calling rounds.
 *
 * Bounded so a model that keeps requesting data cannot spin indefinitely. Four
 * is comfortably above what the scripted questions need — typically one search
 * followed by one detail lookup.
 */
const MAX_ROUNDS = 4;

/** One function the agent called, as shown to the reader. */
export interface AgentCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** An answer, with the calls that produced it. */
export interface AgentAnswer {
  /** The reply, or an explanation of why the question cannot be answered. */
  readonly text: string;
  /** Every function invoked, in order. Rendered in the UI as the audit trail. */
  readonly calls: readonly AgentCall[];
  /** True when the agent declined for want of data rather than answering. */
  readonly declined: boolean;
  /**
   * True when the agent could not run at all.
   *
   * Kept separate from {@link declined} deliberately: a refusal is correct
   * behaviour, an outage is not, and conflating them would let a broken agent
   * score as a well-behaved one.
   */
  readonly failed: boolean;
}

const SYSTEM_INSTRUCTION = `You answer questions about a completed reconciliation run.

HOW YOU WORK
Call the provided functions to retrieve data, then report what they returned. The
functions read results that were computed by a deterministic engine before you were
asked anything.

WHAT YOU MUST NOT DO
- Never state a monetary amount, count, date, or reference that did not appear in a
  function result. Not one you derived, not one you inferred from context, not one
  that would obviously follow.
- Never perform arithmetic. If a difference matters and no function returned it, say
  which figures you have and that the difference is not among them.
- Never predict, forecast, or estimate anything about the future. This data describes
  what already happened.
- Never answer from general knowledge about finance, payments, or accounting. If the
  functions did not return it, you do not know it.

WHEN YOU CANNOT ANSWER
Say so plainly, in one or two sentences, and state what the data does cover. Do not
apologise, do not speculate, and do not offer a guess hedged as a possibility. A clear
"this data does not show that" is a correct and useful answer.

STYLE
Answer in plain English for a finance controller. Quote figures exactly as the
functions returned them, including the currency symbol. Be brief — two or three
sentences is usually right. Do not describe which functions you called; that is shown
to the reader separately.`;

/**
 * Answers a question about a reconciliation run.
 *
 * @param source - Read-only access to the run's results.
 * @param question - The user's question.
 * @returns The answer and the calls that produced it. Never throws for a model
 *   failure; an explanatory answer is returned instead so the interface degrades
 *   rather than breaking.
 */
export async function askAboutRun(
  source: ReconDataSource,
  question: string,
): Promise<AgentAnswer> {
  const calls: AgentCall[] = [];

  try {
    const client = createGeminiClient();
    const contents: Content[] = [{ role: 'user', parts: [{ text: question }] }];

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const response = await client.models.generateContent({
        model: geminiModelId(),
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [...AGENT_FUNCTIONS] }],
          // The agent should report, not improvise. Low temperature keeps it
          // close to what the functions actually returned.
          temperature: 0,
        },
      });

      const functionCalls = response.functionCalls ?? [];

      if (functionCalls.length === 0) {
        const text = response.text ?? '';
        return {
          text: text.trim(),
          calls,
          declined: looksLikeRefusal(text),
          failed: false,
        };
      }

      // Echo the model's own turn back VERBATIM before supplying results.
      //
      // Reconstructing it from name and args looks equivalent and is not: Gemini
      // 3.x attaches a `thoughtSignature` to function-call parts and rejects the
      // follow-up request with a 400 when it is missing. Passing the original
      // content through preserves it — and anything else the model attaches that
      // this code does not know about.
      const modelTurn = response.candidates?.[0]?.content;
      contents.push(
        modelTurn ?? {
          role: 'model',
          parts: functionCalls.map(
            (call): Part => ({ functionCall: { name: call.name ?? '', args: call.args ?? {} } }),
          ),
        },
      );

      const resultParts: Part[] = [];
      for (const call of functionCalls) {
        const name = call.name ?? '';
        const args = (call.args ?? {}) as Record<string, unknown>;
        calls.push({ name, args });
        const result = await callAgentFunction(source, name, args);
        resultParts.push({
          functionResponse: { name, response: { result } as Record<string, unknown> },
        });
      }
      contents.push({ role: 'user', parts: resultParts });
    }

    // Ran out of rounds without settling on an answer. Reporting that is more
    // honest than returning whatever partial text happens to be to hand.
    return {
      text:
        'I could not settle on an answer within the number of lookups allowed. ' +
        'Try asking about one specific record or exception.',
      calls,
      declined: true,
      failed: true,
    };
  } catch (cause) {
    return {
      text: `The assistant is unavailable: ${
        cause instanceof Error ? cause.message : String(cause)
      }. The reconciliation results themselves are unaffected.`,
      calls,
      declined: false,
      failed: true,
    };
  }
}

/**
 * Heuristic for whether an answer was a refusal.
 *
 * Used only to label the reply in the interface — never to suppress or rewrite
 * it, so a misclassification changes a badge and nothing else.
 *
 * Deliberately generous. The first version matched only "does not show/cover/
 * include" and missed genuine refusals phrased as "does not contain", "does not
 * provide", and "I am unable to calculate", which are exactly the forms the
 * model uses when declining to do arithmetic. Under-labelling a refusal is the
 * worse error here: it hides the very behaviour the interface is meant to make
 * visible.
 *
 * This is a *label*, not the grounding check. Whether an answer invented a
 * figure is verified separately and objectively, by comparing every amount it
 * quotes against what the functions returned.
 */
function looksLikeRefusal(text: string): boolean {
  return /\b(do(es)?n?'?t? not (show|cover|include|contain|provide|rank|indicate|support)|cannot (answer|calculate|determine|provide|predict|forecast|estimate)|can'?t (answer|calculate)|unable to (answer|calculate|determine|provide|predict|forecast)|no (data|information|record|figure)s? (for|on|about|available)|not (available|present) in (this|the) data)/i.test(
    text,
  );
}
