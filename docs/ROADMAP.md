# Roadmap — AI Finance Controller

**Last updated:** 29 August 2026
**Deadline:** 4 September 2026 · **Build mode:** solo · **Scope posture:** nothing cut
**Status:** living document — update phase status as work closes.

---

## 1. Phase Status

| Phase | Name | Day | Status |
|---|---|---|---|
| P0 | Documentation set | 1 | 🟢 Complete |
| P1 | Domain model & types | 1 | 🟢 Complete |
| P2 | Synthetic data + ground truth | 1 | 🟢 Complete |
| P3 | Reconciliation engine | 2 | ⚪ Not started |
| P4 | Application foundation | 3 | ⚪ Not started |
| P5 | Pipeline wiring & results UI | 4 | ⚪ Not started |
| P6 | Stage 1 — extraction | 5 | ⚪ Not started |
| P7 | Stage 3 — grounded Q&A | 5 | ⚪ Not started |
| P8 | Bank domain adapter | 6 | ⚪ Not started |
| P9 | Evaluation, polish, deploy | 6 | ⚪ Not started |

⚪ Not started · 🟡 In progress · 🟢 Complete · 🔴 Blocked

---

## 2. Dependency Graph

```
P0 docs
 └─► P1 types ──┬──► P2 generator ──┐
                │                   ├──► P3 engine ──┐
                │                   │                │
                ├───────────────────┘                ├──► P5 wiring ──┬──► P7 agent ──┐
                │                                    │                │               │
                └──► P4 foundation ──────────────────┘                │               ├──► P9 eval
                          │                                           │               │      + deploy
                          └──────────────► P6 extraction ─────────────┘               │
                                                                                      │
                     P8 bank adapter (needs only P1 + P3) ─────────────────────────────┘
```

**Two properties worth noting:**

- **P1–P3 require no external service.** No Supabase account, no Gemini key, no network. If credentials or account setup block Day 3, engine work continues unimpeded. This is the plan's main structural insurance.
- **P8 depends only on P1 and P3.** It can be pulled forward into any gap, or pushed to Day 7, without disturbing anything else. It is the schedule's only genuinely movable piece.

---

## 3. Schedule

| Day | Date | Phases | Milestone |
|---|---|---|---|
| 1 | Fri 29 Aug | P0, P1, P2 | Fixtures + ground truth generating |
| 2 | Sat 30 Aug | P3 | **Engine passing ground-truth tests** |
| 3 | Sun 31 Aug | P4 | **Deployed shell with working Google sign-in + RLS verified** |
| 4 | Mon 1 Sep | P5 | End-to-end CSV → reconciliation → exception queue |
| 5 | Tue 2 Sep | P6, P7 | Both AI stages live |
| 6 | Wed 3 Sep | P8, P9 | **Feature complete and deployed** |
| 7 | Thu 4 Sep | buffer | Rehearsal, submission |

### Two schedule decisions that carry weight

**Deploy on Day 3, not Day 6.** The moment the P4 shell renders a login screen it goes to Vercel. Deployment configuration and — especially — the OAuth redirect-URL mismatch between localhost and production are classic final-night failures. Discovering them on Day 3 costs an hour; discovering them on Day 6 costs the submission. Every subsequent phase then redeploys over a known-working pipeline.

**Engine before infrastructure.** P3 is the highest-value, least-reversible work and has zero external dependencies. Building it on Day 2 means the project's core asset exists before any account, key, or quota can interfere.

---

## 4. Phase Definitions of Done

Each phase closes only when its gate passes. A phase that "mostly works" is not done — it is a Day 7 problem in disguise.

| Phase | Definition of done |
|---|---|
| **P0** | Nine documents written; taxonomy and schema frozen |
| **P1** | Types compile; taxonomy is a discriminated union; money typed as `bigint` minor units |
| **P2** | `npm run generate:fixtures` emits both domains' CSVs plus `ground-truth.json`; regeneration is byte-identical (asserted by test) |
| **P3** | `npm test` green: **≥95% recall, 0 false matches**, byte-identical across two runs, <5s for 1,000 pairs |
| **P4** | Deployed on Vercel; Google sign-in works **on the production URL**; cross-user read from a second account returns zero rows |
| **P5** | Upload fixtures → run → dashboard match rate **equals the test-suite figure for the same fixture** |
| **P6** | Test documents rendered (deferred here from P2); clean doc extracts accurately; degraded doc lands in review; ledger untouched on failure |
| **P7** | Three scripted questions answered with visible call traces; unanswerable question declined |
| **P8** | Bank fixtures reconcile end to end with **zero changes to engine source in the diff** |
| **P9** | `/evaluation` renders live metrics; demo dataset seeded; full loop clean twice on production |

---

## 5. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| R-1 | **Day 5 double-booking** — two AI integrations in one day | High | High | P6 before P7; P8 is movable to Day 7 to buy back P7 time | P6 unfinished by Day 5 midday |
| R-2 | Gemini model ID drift | Medium | Medium | Model ID in env var, not a literal; confirm in AI Studio on Day 5 | 404 on first call |
| R-3 | OAuth redirect misconfigured in production | Medium | High | Deploy Day 3 and test sign-in on the live domain immediately | Sign-in works locally, fails deployed |
| R-4 | Extraction quality on degraded scans | Medium | Low | Confidence gate makes this degrade into review items, not wrong numbers — a safe failure that is itself demoable | Field accuracy below 90% |
| R-5 | Agent states an ungrounded figure | Low | **Critical** | Grounding constraint + call-trace display + manual §3.5 checks | Any demo figure not traceable to a row |
| R-6 | Float creeps into the money path | Medium | High | `bigint` at the type level; P3 tests assert exact integers | Any test failing on a rounding delta |
| R-7 | RLS policy present but ineffective | Medium | **Critical** | Verified by *attempting* a cross-user read, never by reading the policy | Second account returns any row |
| R-8 | Adapter abstraction leaks | Low | Medium | P8's gate is a diff not touching `engine.ts`; fix in types, never patch in adapter | P8 requires an engine edit |
| R-9 | Scope pressure with nothing cut | High | Medium | P8 is the only movable phase; Day 7 buffer absorbs one slip, not two | Any phase ending a full day late |

**R-5 and R-7 are the two critical-impact risks**, and both are failures that *look like success*: an agent that answers fluently but ungroundedly, and a policy that exists but does not block. Both are therefore verified by adversarial test — asking a question whose answer is not in the data, and attempting a read that must fail — rather than by inspection.

---

## 6. Schedule Risk — Stated Plainly

Nothing is being cut, which means **the plan has no designed slack.** Day 7 is the only buffer, and it is nominally reserved for rehearsal and submission.

**Day 5 is the concentration point.** Two independent AI integrations, each with its own SDK learning curve, in one day. If Day 5 slips, it consumes Day 7 and rehearsal margin disappears.

Two structural mitigations, both already built into the ordering above and neither costing anything:

1. **Deploy Day 3** — infrastructure failures surface with days of runway instead of hours.
2. **P1–P3 have zero service dependencies** — account or quota problems cannot stall the core build.

One contingency, if Day 5 overruns: **move P8 (bank adapter) to Day 7 and finish P7 on Day 6.** P8 is cheap by construction and low-risk; P7 is the demo centrepiece. Nothing is cut — the order changes. This is the only rescheduling that does not cost a feature, and it is why P8 was deliberately designed to depend on nothing but P1 and P3.

---

## 7. Post-Submission Backlog

Not in scope; recorded so the boundary is a decision rather than an oversight.

| Item | Source |
|---|---|
| Validate on real anonymised settlement data | `EVALUATION.md` §7 — the highest-value next step by a wide margin |
| DP knapsack for unbounded partial-payment sets | `ARCHITECTURE.md` §9 |
| Per-counterparty tolerance rules learned from corrections | `EVALUATION.md` §7 |
| Exception resolution workflow (assign, comment, close) | `DATA_MODEL.md` §7 |
| Multi-currency with FX-rate-at-date | `PRD.md` §6 |
| Automated grounding assertions in CI | `EVALUATION.md` §7 |
| Async extraction via job queue | `ARCHITECTURE.md` §9 |
