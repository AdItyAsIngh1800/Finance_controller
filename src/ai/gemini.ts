/**
 * Gemini client construction and configuration.
 *
 * The model id is configuration rather than a literal: Gemini's naming has
 * iterated repeatedly this year, and a stale id fails as a 404 at whatever
 * moment it is first exercised. Keeping it in the environment means correcting
 * it does not require a code change.
 *
 * @module
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Reads a required environment variable, stripping surrounding quotes.
 *
 * A value pasted into `.env.local` as `MODEL="gemini-3.6-flash"` will arrive
 * with its quotes intact under some loaders. Stripping them here turns a
 * confusing 404 into a value that simply works.
 */
function required(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return raw.trim().replace(/^["']|["']$/g, '');
}

/** The configured model id. */
export function geminiModelId(): string {
  return required('GEMINI_MODEL_ID');
}

/**
 * Creates a Gemini client.
 *
 * Server-side only. The API key is never exposed to the browser, which is why
 * every model call in this application originates from a route handler.
 */
export function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: required('GEMINI_API_KEY') });
}
