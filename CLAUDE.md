# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev               # Next.js dev server
npm run build             # production build
npm run typecheck         # tsc --noEmit — must pass before commit
npm test                  # vitest run — must pass before commit
npm run test:watch        # vitest in watch mode
npm run lint              # eslint
npm run generate:fixtures # synthetic data + ground-truth manifest (Phase 2; script not yet written)
```

Run a single test file or case:

```bash
npx vitest run src/core/money.test.ts
npx vitest run -t "rejects more than two decimal places"
```

`vitest.config.ts` only collects `src/core/**/*.test.ts`. Tests outside the pure
core are deliberately absent — there are no component or E2E tests.

## What this project is

A reconciliation tool: it matches an external record (payment-processor
settlement or bank statement) against an internal ledger, and for every
discrepancy states why. Two domains — `settlement` (primary) and `bank` — run
against one shared engine.

Work is organised in phases with defined gates. **Check `docs/ROADMAP.md` §1 for
current phase status before starting anything.**

## Architecture

### The three-stage pipeline, and where AI is deliberately absent

| Stage | Job | AI? |
|---|---|---|
| 1 Extract | messy PDFs/images → structured records | **yes** — Gemini multimodal, per-field confidence |
| 2 Reconcile | structured records → matches + exceptions | **no, deliberately** |
| 3 Explain | results → traced answers | **yes, grounded** — read-only function calls only |

Stage 2 having no model is the project's central design position, not an
unfinished piece. Do not introduce an LLM, heuristic scoring, or any
non-deterministic step into `src/core/reconcile/`. Identical input must produce
byte-identical output.

Stage 1 quarantines any field below 0.85 confidence into a review queue; it never
enters the ledger unconfirmed. Stage 3 may only *quote* figures returned by its
functions — never compute one. See `docs/ARCHITECTURE.md` §1.

### `src/core/` imports nothing

The dependency rule is one-directional and absolute: `src/app/` and `src/ai/` may
import `src/core/`; **`src/core/` imports no database client, no AI SDK, no
framework, and no Next.js.** This is what makes the engine testable without mocks
and reusable across both domains. Breaking it breaks the test strategy.

### One engine, two domains, via adapters

Both domains normalize to `NormalizedRecord` (`src/core/types.ts`) *before*
matching. Domain-specific data rides in the `detail` discriminated union
(`SettlementDetail` | `BankDetail`), which the engine ignores and the UI and
agent read.

Consequence: adding the bank domain must require **zero changes to engine
source**. If an adapter change forces an engine edit, the abstraction leaked —
fix it in the types, do not patch it in the adapter.

Adapters own sign conventions (bank debits are negated at the boundary), so the
engine never reasons about debit/credit.

### Money is a branded bigint — floats are unrepresentable

`Minor` (`src/core/money.ts`) is `bigint` branded with a unique symbol: an
integer count of paise. A plain `bigint` or `number` cannot enter the money path
without an explicit converter.

- Parse input with `parseMinor()`. It **rejects** more than 2 decimal places
  rather than rounding — silent rounding would create a discrepancy the engine
  later reports with no way to trace it back to the parse.
- Tolerances use `basisPointsOf()`, which truncates toward zero (errs tight).
- `tsconfig.json` targets **ES2022**, not the `create-next-app` default of
  ES2017, because `bigint` literals are a syntax error below ES2020.

### The exception taxonomy is frozen

The 8 members of `ExceptionType` (`src/core/taxonomy.ts`) are a closed
vocabulary shared verbatim by the engine, the Postgres enum, the exception queue
UI, and the agent's function results. Adding or renaming one means changing all
four together.

Severity is not cosmetic: `TIMING_DIFFERENCE` and `PARTIAL_PAYMENT` are `low`
because the money *is* accounted for — it moved on a different day or in pieces.
Everything unaccounted-for is `high`. That split is what keeps the queue useful
rather than merely long.

### Matching is tiered, and errors are asymmetric

Tiers run strongest-evidence-first (`EXACT_REF` → `EXACT_AMOUNT_DATE` →
`FUZZY_REF` → `PARTIAL_SET`), each seeing only the previous tier's residue, so a
speculative match can never displace a confident one. Every match records its
tier — that is what lets Stage 3 explain *how* records were paired. Residue
becomes typed exceptions.

**A false match and a false exception are not equally bad.** A false exception
costs a reviewer 30 seconds; a false match silently hides the discrepancy the
product exists to catch. Targets are therefore ≥95% recall but **zero** false
matches. When ambiguous, emit `DUPLICATE_SUSPECTED` rather than guessing.

### Security (Phase 4 onward)

Google sign-in gates the UI; **Row-Level Security gates the data.** The anon key
ships to the browser and is only safe while RLS holds, so every user-scoped table
needs a policy with both `using` and `with check` — without `with check` a user
can insert rows attributed to someone else. Verify by *attempting* a cross-user
read, never by reading the policy.

Reconciliation runs are append-only and snapshot their thresholds into
`recon_runs.params`, so results stay explicable after defaults are retuned.

## Documentation map

`docs/` is the source of truth for decisions; code cross-references it with
`@see docs/FILE.md §N`.

| File | Authoritative for |
|---|---|
| `ARCHITECTURE.md` | AI trust boundaries (§1), adapter pattern, engine design |
| `DATA_MODEL.md` | Schema, frozen taxonomy (§3.4), RLS policy shape (§6) |
| `REQUIREMENTS.md` | Numbered FR/NFR with verification methods |
| `ROADMAP.md` | Phase status, gates, risk register |
| `EVALUATION.md` | Ground-truth methodology, metrics, known limitations |
| `DESIGN.md` | Screens, states, visual language |
| `TECH_STACK.md` | Every technology choice and its rejected alternative |
| `PRD.md` | Problem, scope boundaries, success criteria |

## Constraints worth knowing

- **Deadline-bound build** (buildathon, 4 Sep 2026) with no scope being cut.
  `docs/ROADMAP.md` §6 records where the schedule risk sits.
- `fixtures/` is gitignored and regenerated by `npm run generate:fixtures`.
- No CI. `npm run typecheck` and `npm test` are run locally before each commit.
- `AGENTS.md`'s Next.js block is regenerated by `next dev`; project rules live
  *below* its `END:nextjs-agent-rules` marker and survive regeneration. Keep them
  there.
