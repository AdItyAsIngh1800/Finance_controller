# Architecture — Reckon

**Last updated:** 29 August 2026
**Companion documents:** `DATA_MODEL.md` (schema), `TECH_STACK.md` (choices), `EVALUATION.md` (proof)

---

## 1. AI Trust Boundaries

> *This is the most important section in this document. Everything below it is implementation.*

The system does three jobs. Two of them use AI. One deliberately does not, and the reason it does not is the point of the architecture.

| Stage | Job | AI? | Reasoning |
|---|---|---|---|
| **1 — Extract** | Messy PDFs and scans → structured records | **Yes** | Reading unstructured documents is genuinely hard for rules and genuinely easy for a multimodal model. There is no deterministic alternative that works. |
| **2 — Reconcile** | Structured records → matches and exceptions | **No — deliberately** | Comparing amounts and dates has exact answers. A model here would trade determinism and auditability for nothing. |
| **3 — Explain** | Reconciliation results → traced answers | **Yes, constrained** | Turning structured findings into an explanation is a language task. The model may retrieve and phrase; it may not compute. |

### Why Stage 2 has no AI

The instinct in a tool like Reckon is to put a model in the middle. This system does the opposite, for four reasons:

1. **The problem has exact answers.** `41235 == 41235` is not a judgment call. A model asked to make that comparison can only introduce error.
2. **Determinism is a feature.** Identical input yields byte-identical output (`REQUIREMENTS.md` NFR-1.4). A reconciliation that changes its answer between runs cannot be signed off.
3. **Auditability.** Every match records the tier that produced it and the deltas involved. "Matched on exact reference with a 2-day timing difference" is a defensible statement. "The model thought these went together" is not.
4. **It is what makes Stage 3 trustworthy.** The agent explains results it did not compute. If the model both produced *and* explained the numbers, the explanation would carry no independent weight.

### How Stage 1 is constrained

The model reads documents; it does not decide what is true.

- Output is schema-constrained (`responseSchema`) — shape is guaranteed, not hoped for.
- **Every field carries a confidence score.** Below 0.85, the record is marked `needs_review` and **blocked from the ledger** until a human confirms it.
- The failure mode is therefore *safe*: a bad scan produces a review item, never a wrong number silently entering reconciliation.

The review queue is a first-class screen precisely because it is this boundary made visible.

### How Stage 3 is constrained

The agent answers **only** from read-only function calls against rows the deterministic engine already produced.

- Four narrow, read-only functions. No write path exists for the agent to reach.
- Figures come from `exceptions.evidence` and `source_records.detail` — **quoted, not derived**. The agent is forbidden from performing arithmetic to produce a number the engine did not.
- When the functions cannot answer, it says so rather than inferring.
- **Every answer displays which functions were called, with what arguments.** This turns "trust me" into "check me."

> A question like *"what will next month's payout be?"* must be declined. That refusal is not a limitation to hide in the demo — it is the clearest possible evidence the grounding works.

---

## 2. System Overview

```
┌──────────── Browser ────────────┐
│  Next.js App Router (React)     │
│  Auth · Upload · Review ·       │
│  Dashboard · Exceptions · Ask   │
└────────────────┬────────────────┘
                 │  (session cookie)
┌────────────────▼─────────────────────────────────────────┐
│  Next.js API Routes  ·  server-only secrets              │
│                                                          │
│  /api/ingest    CSV   → adapter → normalized → DB        │
│  /api/extract   file  → Gemini → confidence gate → DB    │
│  /api/recon/run rows  → ENGINE (pure, no AI) → DB        │
│  /api/ask       Q      → Gemini + read-only fns → answer │
└───┬───────────────────────┬──────────────────────────┬───┘
    │                       │                          │
┌───▼────────┐   ┌──────────▼──────────┐   ┌───────────▼─────────┐
│ Core       │   │ Supabase            │   │ Gemini API          │
│ (pure TS)  │   │ Postgres + RLS      │   │ @google/genai       │
│ adapters   │   │ Storage · Auth      │   │ Stages 1 and 3 only │
│ engine     │   └─────────────────────┘   └─────────────────────┘
└────────────┘
```

**`src/core/` imports nothing.** No database client, no Gemini SDK, no Next.js, no React. It is pure TypeScript over plain data. That constraint is what makes the engine testable without mocks and reusable across both domains — and it is enforced by review, not convention (`REQUIREMENTS.md` NFR-6.1).

---

## 3. The Adapter Pattern

One decision carries most of the architecture's weight: **both domains normalize to one shape before matching.**

```
settlement CSV ─┐
settlement PDF ─┤─► SettlementAdapter ─┐
                │                      │
bank CSV ───────┤─► BankAdapter ───────┤─► NormalizedRecord[] ─► Engine ─► matches
bank PDF ───────┘                      │                        (one)      exceptions
                                       │
                        domain-specific data rides in `detail` JSONB
```

`NormalizedRecord` is the contract:

```ts
{ id, externalRef, normalizedRef, date, amountMinor, description, detail }
```

Adapters own everything domain-specific:

| Concern | Settlement adapter | Bank adapter |
|---|---|---|
| Reference source | Order/payout ID | UTR or narration-extracted token |
| Sign convention | Net payout, positive | Credit positive, **debit negated** |
| `detail` payload | Fee lines, refunds, chargebacks | Narration, direction, running balance |
| Extra check | `FEE_VARIANCE` arithmetic | *(none)* |

**Consequence:** the second domain costs an adapter, fixtures, and a label map — not a second application. This is what makes "both domains, nothing cut" affordable solo in six days.

**Falsifiable claim:** adding bank mode requires **zero** changes to engine source (`REQUIREMENTS.md` FR-8.3). If Phase 8's diff touches `engine.ts`, the abstraction leaked and belongs fixed in the types, not patched in the adapter.

---

## 4. The Reconciliation Engine

Tiered matching. Each tier sees only what previous tiers left unmatched, and **every match records the tier that claimed it** — which is what lets Stage 3 explain how a match was made.

```
source[] + ledger[]
      │
      ├─ Tier 1  EXACT_REF          normalized ref equal AND amount equal
      ├─ Tier 2  EXACT_AMOUNT_DATE  amount equal, |Δdate| ≤ window
      ├─ Tier 3  FUZZY_REF          similarity ≥ 0.85, amount within tolerance
      ├─ Tier 4  PARTIAL_SET        bounded subset-sum (≤3 records)
      │
      ├─ settlement only: net = gross − fees − refunds − chargebacks
      │
      └─ residue ─► exceptions (typed, with a plain-English stated reason)
```

**Ordering is deliberate: strongest evidence first.** A record claimed by Tier 1 is never reconsidered by fuzzy matching, so a high-confidence match can never be displaced by a speculative one.

**Design commitments:**

- **Integer minor units throughout.** No float touches money. Percentage tolerances are computed in integer space and rounded explicitly at the comparison point.
- **Thresholds are named constants** in `config.ts`, snapshotted into `recon_runs.params`, and surfaced read-only in the UI. A tolerance a user cannot see is a magic number they cannot trust.
- **Ambiguity becomes an exception, never a guess.** Two viable counterparts produce `DUPLICATE_SUSPECTED` rather than a coin flip. The engine's job is to be right or to say it does not know.
- **Subset-sum is bounded at 3 elements** — a deliberate ceiling, commented as such, upgradeable to a DP knapsack if real data demands it.

**Asymmetric error handling.** A false *exception* costs a human thirty seconds. A false *match* silently conceals a real discrepancy — the exact failure this product exists to prevent. The engine is tuned to prefer the former, and `NFR-1.2` sets false matches at zero while `NFR-1.1` allows 5% recall slack.

---

## 5. Data Flow: Ingestion to Answer

```
1. Upload
   CSV  → adapter → NormalizedRecord[] → source_records / ledger_entries
   PDF  → Storage → Gemini (schema + confidence)
                       │
                       ├─ all fields ≥ 0.85 ──► confirmed ──► promoted to record
                       └─ any field < 0.85 ───► needs_review ──► HUMAN GATE
                                                                     │
                                                        confirm/correct ──► promoted

2. Reconcile
   records → engine (pure) → recon_runs + matches + exceptions

3. Explain
   question → Gemini + read-only fns → rows → grounded answer + call trace
```

The human gate is the only place in the pipeline where the flow deliberately stops. That is the architecture's thesis expressed as control flow.

---

## 6. Security Model

**Two layers, and only one of them is real.** The Google sign-in gates the interface. **Row-Level Security gates the data** — every user-scoped table carries `user_id` with a `for all` policy including `with check`. Without `with check`, a user can read only their own rows but insert rows attributed to someone else.

The anon key ships to the browser and that is safe **only while RLS holds** — which is why RLS is a P0 requirement rather than a hardening task, and why it is verified by attempting a cross-user read rather than by reading the policy.

The service-role key and the Gemini key live server-side only. All Gemini calls originate from API routes; no model credential ever reaches the client. Storage objects are path-prefixed per user with a matching policy.

---

## 7. Failure Modes

| Failure | Behaviour | Principle |
|---|---|---|
| Gemini unavailable during extraction | `status = failed`, error surfaced, **ledger untouched** | Never write a partial record |
| Low extraction confidence | `needs_review`, blocked from ledger | Quarantine, never guess |
| Gemini unavailable during Q&A | Q&A degrades; dashboard and exception queue fully usable | AI is additive, not load-bearing |
| Malformed CSV row | Rejected with row number and reason | Never silently drop data |
| Agent asked something unanswerable | Explicit refusal | Grounding working as designed |
| Reconciliation error mid-run | Run fails atomically; prior runs intact | Runs are append-only |

**The pattern:** every failure degrades toward *less information*, never toward *wrong information*. In a reconciliation tool a missing answer is recoverable; a confidently wrong one is not.

---

## 8. Project Structure

```
src/
  core/                    ← pure TypeScript, zero external imports
    types.ts               NormalizedRecord, Match, Exception
    taxonomy.ts            frozen exception taxonomy
    adapters/              settlement.ts · bank.ts
    reconcile/             engine.ts · tiers.ts · config.ts · engine.test.ts
    generate/              synthetic data + ground-truth manifest
  ai/
    extract.ts             Stage 1 — Gemini multimodal + confidence gate
    agent.ts               Stage 3 — Gemini function calling, read-only
  lib/supabase/            server.ts · client.ts · middleware.ts
  app/
    api/                   ingest · extract · recon · ask
    (auth)/ · datasets/ · review/ · exceptions/ · evaluation/
docs/                      this documentation set
fixtures/                  generated data + ground-truth manifests
```

The dependency rule is one-directional and absolute: **`app/` and `ai/` may import `core/`; `core/` imports nothing.**

---

## 9. Known Architectural Limitations

Stated here rather than discovered by a judge:

| Limitation | Consequence | Upgrade path |
|---|---|---|
| Subset-sum bounded to 3 elements | A payment split 4+ ways is missed | DP knapsack |
| Single currency per dataset | No cross-currency matching | FX-rate-at-date table |
| Synchronous extraction | Large batches hit request timeouts | Job queue |
| In-memory reconciliation | Bounded by serverless memory (~10⁵ records) | Stream in batches |
| Validated on synthetic data only | Real-world messiness untested | Pilot on anonymised real data |
| No exception resolution workflow | Queue is read-only; no assign/close | Status column + audit log |

The honest headline: **this system has never seen a real bank statement.** Its accuracy figures are measured against data it generated itself, which validates the engine's logic but not its assumptions about how real documents are messy. That distinction is preserved rather than blurred — see `EVALUATION.md`.
