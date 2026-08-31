# Requirements — AI Finance Controller

**Last updated:** 29 August 2026
**Companion documents:** `PRD.md` (why), `ARCHITECTURE.md` (how), `EVALUATION.md` (proof)

Every requirement below is written to be independently verifiable. `VERIFICATION.md`-style gates live in `ROADMAP.md` §Verification; each requirement here names how it is checked.

**Priority key:** **P0** = submission fails without it · **P1** = materially weakens the submission · **P2** = nice to have

---

## Functional Requirements

### FR-1 — Authentication & Isolation

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-1.1 | A user can sign in with a Google account | P0 | Manual sign-in on deployed URL |
| FR-1.1a | A user can create an account and sign in with email and password | P0 | Create two accounts; sign in as each |
| FR-1.2 | Unauthenticated requests to application routes redirect to sign-in | P0 | Request a protected route with no session |
| FR-1.3 | A user can sign out, invalidating the session | P1 | Sign out, then attempt a protected route |
| FR-1.4 | A user can read **only** their own datasets, records, runs, and exceptions | P0 | Second account attempts cross-user read via SQL editor; must return zero rows |
| FR-1.5 | Isolation is enforced at the database layer (RLS), not only in application code | P0 | Query with the anon key directly, bypassing the app |

> FR-1.4 and FR-1.5 are distinct requirements on purpose. FR-1.4 can pass while FR-1.5 fails, and that combination is a data breach waiting behind a login screen.

### FR-2 — Dataset Management

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-2.1 | A user can create a named dataset and select a domain (`settlement` \| `bank`) | P0 | Create one of each |
| FR-2.2 | A dataset holds two sides: external source records and internal ledger entries | P0 | Schema inspection |
| FR-2.3 | A user can list their datasets and open one | P0 | UI walkthrough |
| FR-2.4 | A user can delete a dataset and all dependent rows | P2 | Delete, confirm cascade |

### FR-3 — CSV Ingestion

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-3.1 | A user can upload a CSV for either side of a dataset | P0 | Upload fixture CSVs |
| FR-3.2 | The domain adapter normalizes CSV rows into `NormalizedRecord` | P0 | Unit test per adapter |
| FR-3.3 | Malformed rows are rejected with a row-numbered reason, not silently dropped | P0 | Upload a deliberately corrupt CSV |
| FR-3.4 | Monetary values are parsed to integer minor units; no float is retained | P0 | Unit test asserting integer type and exact value |
| FR-3.5 | Ingestion is idempotent per file — re-uploading does not duplicate records | P1 | Upload the same file twice, compare row counts |

### FR-4 — Stage 1: Document Extraction (AI)

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-4.1 | A user can upload a PDF or image as a source document | P0 | Upload fixture PDF |
| FR-4.2 | Extraction returns structured fields conforming to a declared response schema | P0 | Schema validation on response |
| FR-4.3 | Every extracted field carries a confidence score in `[0,1]` | P0 | Inspect stored extraction row |
| FR-4.4 | Fields below the confidence threshold (0.85) are marked `needs_review` and **do not** enter the ledger | P0 | Feed a degraded scan; assert it is quarantined |
| FR-4.5 | A review screen shows the source document beside extracted fields, highlighting low-confidence values | P0 | UI walkthrough |
| FR-4.6 | An extraction whose fields all clear the threshold is promoted automatically; one with any field below it is promoted only after a human confirms | P0 | Upload a clean document (record appears) and a degraded one (record appears only after confirming) |
| FR-4.7 | Extraction failure (unreadable file, API error) surfaces a clear error and leaves the ledger untouched | P0 | Upload a non-document file |
| FR-4.8 | A human can discard an extraction without promoting it, including one that failed to read | P0 | Discard one of each; confirm the queue clears and no record is written |
| FR-4.9 | Documents are accepted only for domains whose schema can describe them | P0 | Upload a PDF to a bank dataset; must be refused with a reason |

> FR-4.4 is the single most important functional requirement in this document. It is the product's claim about AI trust, expressed as behaviour.

### FR-5 — Stage 2: Reconciliation (Deterministic)

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-5.1 | A user can run reconciliation over a dataset | P0 | Trigger a run |
| FR-5.2 | Matching proceeds in ordered tiers; each tier considers only prior-tier residue | P0 | Unit tests per tier |
| FR-5.3 | Every match records the tier that produced it and the deltas involved | P0 | Inspect `matches` rows |
| FR-5.4 | Every unmatched or anomalous record produces an exception with a typed category and a plain-English stated reason | P0 | Inspect `exceptions` rows |
| FR-5.5 | The exception category is drawn from the frozen taxonomy in `DATA_MODEL.md` | P0 | Type-level enum; no free-form strings |
| FR-5.6 | Settlement mode verifies `net = gross − fees − refunds − chargebacks` and raises `FEE_VARIANCE` on mismatch | P0 | Fixture with a planted variance |
| FR-5.7 | The engine contains **no** LLM/network call and is deterministic — identical input yields byte-identical output | P0 | Run twice, diff results |
| FR-5.8 | Matching thresholds are named constants, surfaced read-only in the UI | P1 | Parameters panel visible on dashboard |
| FR-5.9 | Reconciliation over 1,000 record pairs completes in under 5 seconds | P1 | Timed test run |

### FR-6 — Results & Exception Queue

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-6.1 | Dashboard shows match rate as the headline figure | P0 | UI walkthrough |
| FR-6.2 | Dashboard shows counts broken down by exception type | P0 | UI walkthrough |
| FR-6.3 | Exception queue is filterable by type and severity | P0 | Filter interaction |
| FR-6.4 | Each exception expands to show both sides of the comparison and the stated reason | P0 | Expand a row of each type |
| FR-6.5 | Empty, loading, and error states are designed, not default | P1 | Visit with no data; simulate failure |

### FR-7 — Stage 3: Grounded Q&A Agent (AI)

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-7.1 | A user can ask a natural-language question about a reconciliation run | P0 | Ask a scripted question |
| FR-7.2 | The agent answers using **only** read-only function calls against persisted rows | P0 | Code review + trace inspection |
| FR-7.3 | The functions exposed are read-only; the agent cannot mutate state | P0 | Code review of function surface |
| FR-7.4 | Every answer displays which functions were called and with what arguments | P0 | UI shows call trace |
| FR-7.5 | When the data cannot answer the question, the agent says so explicitly rather than speculating | P0 | Ask a deliberately unanswerable question |
| FR-7.6 | The agent never states a monetary figure that did not originate in a function result | P0 | Cross-check demo answers against DB rows |
| FR-7.7 | Multi-turn follow-up retains context of the prior question | P1 | Two-turn exchange |

> FR-7.5 and FR-7.6 are the reason this stage is allowed to use AI at all. If either fails, the grounding claim collapses.

### FR-8 — Dual Domain Support

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-8.1 | Settlement mode is fully supported (primary demo path) | P0 | Full flow on settlement fixtures |
| FR-8.2 | Bank mode is fully supported against the same engine | P0 | Full flow on bank fixtures |
| FR-8.3 | Adding the bank domain requires **no** change to engine source | P0 | Diff shows adapter + fixtures only |
| FR-8.4 | Settlement-only checks are suppressed in bank mode | P0 | No `FEE_VARIANCE` in bank results |

### FR-9 — Evaluation

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-9.1 | A synthetic data generator emits paired datasets plus a ground-truth manifest of planted discrepancies | P0 | Run generator; inspect manifest |
| FR-9.2 | An automated test scores engine output against the manifest | P0 | `npm test` |
| FR-9.3 | An in-app evaluation page reports precision and recall per exception type | P0 | Visit `/evaluation` |
| FR-9.4 | Extraction accuracy against known-answer documents is reported | P1 | Evaluation page section |
| FR-9.5 | Known limitations are documented in-product, not only in the repo | P1 | Limitations section on evaluation page |

---

## Non-Functional Requirements

### NFR-1 — Correctness

| ID | Requirement | Threshold | Verified by |
|---|---|---|---|
| NFR-1.1 | Recall on planted exceptions | ≥ 95% | Ground-truth test |
| NFR-1.2 | False matches on known-clean pairs | **0** | Ground-truth test |
| NFR-1.3 | All monetary arithmetic in integer minor units | No float ops on money | Type-level + lint review |
| NFR-1.4 | Engine output is deterministic | Byte-identical across runs | Repeat-run diff |

> NFR-1.2 is stricter than NFR-1.1 deliberately. A **false exception** costs a human thirty seconds of review. A **false match** silently hides a real discrepancy and is the failure this product exists to prevent. They are not symmetric errors and are not treated as such.

### NFR-2 — Security

| ID | Requirement | Priority |
|---|---|---|
| NFR-2.1 | Row-Level Security enabled on every user-scoped table, keyed to `auth.uid()` | P0 |
| NFR-2.2 | Storage bucket policies restrict document access to the owning user | P0 |
| NFR-2.3 | API keys (Gemini, Supabase service role) are server-side only, never shipped to the client | P0 |
| NFR-2.4 | Uploaded file type and size are validated before processing | P0 |
| NFR-2.5 | No secrets committed to the repository | P0 |

### NFR-3 — Performance

| ID | Requirement | Threshold |
|---|---|---|
| NFR-3.1 | Reconciliation of 1,000 pairs | < 5 s |
| NFR-3.2 | Dashboard first meaningful paint | < 2 s |
| NFR-3.3 | Extraction round-trip per document | < 30 s |
| NFR-3.4 | Agent first token | < 5 s |

### NFR-4 — Reliability

| ID | Requirement | Priority |
|---|---|---|
| NFR-4.1 | An AI API failure degrades gracefully with a clear message; it never corrupts persisted data | P0 |
| NFR-4.2 | A failed reconciliation run leaves prior results intact | P1 |
| NFR-4.3 | The demo path does not depend on a live upload succeeding (seeded dataset available) | P0 |

### NFR-5 — Usability & Accessibility

| ID | Requirement | Priority |
|---|---|---|
| NFR-5.1 | Exception reasons are plain English, not error codes | P0 |
| NFR-5.2 | Monetary values display with currency symbol and consistent precision | P0 |
| NFR-5.3 | Interactive controls are keyboard reachable with visible focus | P1 |
| NFR-5.4 | Colour is never the sole carrier of meaning (severity also uses label/icon) | P1 |
| NFR-5.5 | Usable at 1280px width and above | P1 |

### NFR-6 — Maintainability

| ID | Requirement | Priority |
|---|---|---|
| NFR-6.1 | Core engine is pure TypeScript with no DB, network, or framework imports | P0 |
| NFR-6.2 | Domain differences live in adapters; the engine is domain-agnostic | P0 |
| NFR-6.3 | Deliberate simplifications carry a comment naming the ceiling and upgrade path | P1 |
| NFR-6.4 | Thresholds are named constants in one config module, never inline literals | P0 |

---

## Traceability

| PRD Success Criterion | Satisfied by |
|---|---|
| SC-1 Runs deployed end to end | FR-1.1, FR-3.1, FR-5.1, FR-7.1, NFR-4.3 |
| SC-2 Matching accurate | NFR-1.1, NFR-1.2, FR-9.2 |
| SC-3 AI judgment explicit | FR-4.4, FR-4.5, FR-5.7, FR-7.4 |
| SC-4 Agent cannot invent | FR-7.5, FR-7.6 |
| SC-5 Accuracy stated | FR-9.1, FR-9.2, FR-9.3 |
| SC-6 Limitations documented | FR-9.5 |
