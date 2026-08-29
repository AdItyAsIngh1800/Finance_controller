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
npm run generate:fixtures # regenerate synthetic data + ground-truth manifests
npm run scorecard         # print per-type precision/recall and false matches
supabase db push          # apply migrations in supabase/migrations/
```

Run a single test file or case:

```bash
npx vitest run src/core/reconcile/engine.test.ts
npx vitest run -t "reports zero false matches"
```

`vitest.config.ts` only collects `src/core/**/*.test.ts`. Tests outside the pure
core are deliberately absent — there are no component or E2E tests.

**`npm run scorecard` is the honest check, not `npm test`.** Green assertions
cannot distinguish "recall 1.00 because everything was found" from "recall 1.00
because nothing was planted". After any change to the engine or the generators,
read the scorecard's actual counts.

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

The dependency rule is one-directional and absolute: `src/app/`, `src/lib/`, and
`src/ai/` may import `src/core/`; **`src/core/` imports no database client, no AI
SDK, no framework, and no Next.js.** Its one external dependency is
`fastest-levenshtein`, a pure string function. This is what makes the engine
testable without mocks and reusable across both domains.

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
- `toDecimalString()` for machine output; `formatMinor()` for display.
- `tsconfig.json` targets **ES2022**, not the `create-next-app` default of
  ES2017, because `bigint` literals are a syntax error below ES2020.

### The exception taxonomy is frozen, and has two axes

The 8 members of `ExceptionType` (`src/core/taxonomy.ts`) are a closed vocabulary
shared verbatim by the engine, the Postgres enum, the exception queue UI, and the
agent's function results. Adding or renaming one means changing all four.

Two independent classifications hang off it, both in `taxonomy.ts`:

- **`EXCEPTION_SEVERITY`** — `TIMING_DIFFERENCE` and `PARTIAL_PAYMENT` are `low`
  because the money *is* accounted for; anything unaccounted-for is `high`.
- **`EXCEPTION_DISPOSITION`** — `blocking` exceptions leave their records
  unmatched and excluded from the match rate; `advisory` ones annotate a match
  that was still made. A payout that arrived two days late is reconciled *and*
  flagged. This follows from the severity semantics: "low because the money is
  accounted for" is only coherent if the records actually paired up.

### Matching is tiered, mutually unique, and asymmetric about error

Tiers run strongest-evidence-first (`EXACT_REF` → `EXACT_AMOUNT_DATE` →
`FUZZY_REF` → `PARTIAL_SET`), each seeing only the previous tier's residue, so a
speculative match can never displace a confident one. Every match records its
tier — that is what lets Stage 3 explain *how* records were paired.

**A pairing is accepted only when each record is the other's sole candidate.**
Contested groups become `DUPLICATE_SUSPECTED`. There is no tie-breaking anywhere
in the engine, which is both why it is deterministic and why false matches are
zero rather than merely low.

**After the tiers, before declaring anything unmatched**, residue analysis pairs
up records whose references agree but whose amounts do not, and reports
`AMOUNT_MISMATCH`. Without that step they would surface as two unrelated orphans,
losing the information that makes them actionable.

**A false match and a false exception are not equally bad.** A false exception
costs a reviewer 30 seconds; a false match silently hides the discrepancy the
product exists to catch. Targets are ≥95% recall but **zero** false matches.

### Fixtures must exercise every tier

`src/core/generate/` plants known discrepancies *and* applies **reference
variance** to clean pairs (`plant.ts` → `applyReferenceVariance`). The variance is
not a discrepancy: those pairs still correspond and still agree on amount, and no
exception is expected from them. They exist solely to deny an exact-reference
match and force the engine onto a weaker tier.

This matters because the suite once passed fully green while two of the four
tiers never executed — every fixture agreed on its reference, so tier 1 claimed
everything. `engine.test.ts` now asserts every tier claims at least one match.
When adding fixtures, check the scorecard's tier histogram, not just the pass count.

Scoring lives in `src/core/score.ts`, not in the test file, because the
`/evaluation` page reports the same figures. Computing a metric one way for tests
and another for the UI would be worse than no metric.

### Security — RLS is the control, not the login screen

Google sign-in gates the UI; **Row-Level Security gates the data.** The
publishable key ships to the browser and is safe only while RLS holds. Every
user-scoped table needs a policy with both `using` and `with check` — without
`with check`, a user can read only their own rows but *insert* rows attributed to
someone else.

**There is deliberately no service-role key in this project** — not in the repo,
not in `.env.local`, and it must not be added to Vercel. It bypasses RLS
entirely, so one careless import into a client component would expose every row.
Every query runs as the signed-in user instead. The cost: Phase 9 demo data must
be seeded through the app while signed in, not by an admin script.

Server code uses `getCurrentUser()` (`src/lib/supabase/server.ts`), which calls
`getUser()` — it revalidates the token with the auth server, unlike `getSession()`
which trusts a client-supplied cookie.

**Verify RLS by attempting an operation that must fail, never by reading the
policy.** With empty tables a read test proves nothing; an anonymous `INSERT`
returning `42501` proves `with check` works.

Reconciliation runs are append-only and snapshot their thresholds into
`recon_runs.params`, so results stay explicable after defaults are retuned.

### Supabase operational notes

- Project ref `ocsrrsropbykmffcdrfj` (`Finance_controller`, ap-southeast-1).
- **The Supabase MCP server is read-only** — it refuses DDL. Apply schema changes
  with `supabase db push`; the CLI is authenticated and the project is linked.
  Use MCP for inspection (`list_tables`, `get_advisors`, `execute_sql` reads).
- Run `get_advisors` with type `security` after any DDL change.
- Migrations must be named `<timestamp>_<name>.sql` or the CLI will not see them.

## Documentation map

`docs/` is the source of truth for decisions; code cross-references it with
`@see docs/FILE.md §N`.

| File | Authoritative for |
|---|---|
| `ARCHITECTURE.md` | AI trust boundaries (§1), adapter pattern, engine design |
| `DATA_MODEL.md` | Schema, frozen taxonomy (§3.4), RLS policy shape (§6) |
| `REQUIREMENTS.md` | Numbered FR/NFR with verification methods |
| `ROADMAP.md` | Phase status, gates, risk register |
| `EVALUATION.md` | Ground-truth methodology, measured results, known limitations |
| `DESIGN.md` | Screens, states, visual language |
| `TECH_STACK.md` | Every technology choice and its rejected alternative |
| `PRD.md` | Problem, scope boundaries, success criteria |

## Constraints worth knowing

- **Deadline-bound build** (buildathon, 4 Sep 2026) with no scope being cut.
  `docs/ROADMAP.md` §6 records where the schedule risk sits.
- `fixtures/` is gitignored and regenerated by `npm run generate:fixtures`. The
  generators are seeded and must stay byte-identical across runs — there is no
  committed copy to diff against, so `generate.test.ts` is the only guard.
- No CI. `npm run typecheck` and `npm test` run locally before each commit.
- `AGENTS.md`'s Next.js block is regenerated by `next dev`; project rules live
  *below* its `END:nextjs-agent-rules` marker and survive regeneration. Keep them
  there.
