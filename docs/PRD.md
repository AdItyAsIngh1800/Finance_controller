# Product Requirements Document — Reckon

**Status:** Draft v1
**Author:** Aditya Singh
**Last updated:** 29 August 2026
**Buildathon track:** 04 — Reckon
**Submission deadline:** 4 September 2026

---

## 1. Problem Statement

Every finance team reconciles two sources of truth that never quite agree.

On one side is the **external record**: what a payment processor says it paid out, or what a bank statement says moved through the account. On the other side is the **internal ledger**: what the business believes it earned and owes.

These two disagree constantly, and for mundane reasons — a payout lands two days after the sale it settles, a refund is netted out silently, a fee schedule changed mid-month, one invoice is paid in three instalments, a record is entered twice. None of these are fraud. All of them look identical to fraud until someone checks.

Today that checking is done by hand, in spreadsheets, at month-end, by a person applying rules that live only in their head. It is slow, it does not scale, and — critically — **the reasoning is never written down**. When a payout is short, the answer exists somewhere in a fee breakdown, but recovering it means a human retracing the arithmetic.

The valuable output of reconciliation is not the list of things that matched. It is the **residue**: the records that did not match, and a defensible statement of *why*.

## 2. Target User

**Primary: the finance controller / operations analyst** at a small-to-mid-sized business or marketplace seller.

- Reconciles processor settlements or bank statements against an internal ledger on a weekly or monthly cycle.
- Comfortable with spreadsheets; not a developer.
- Is accountable for the numbers being right. Cannot sign off on a figure they cannot explain.
- Their real pain is not the matching — it is the twenty minutes spent reconstructing why one payout was ₹412 short.

**Secondary: the founder / owner-operator** who does their own books and lacks a finance hire, for whom the exception list is a to-do list.

**Explicit non-user:** the auditor. This tool is not an audit system of record and does not claim to be. See §6.

## 3. Product Overview

A web application implementing a **three-stage pipeline**, where the trust boundary at each handoff is deliberate and visible:

| Stage | Input | Output | Who does the work |
|---|---|---|---|
| **1 — Extract** | Messy PDFs, scans, images | Structured records with per-field confidence | **AI.** Reading unstructured documents is what a model is genuinely good at. |
| **2 — Reconcile** | Structured records from both sides | Matches + categorised exceptions | **Deterministic code, no AI.** Numeric and date matching is solved; a model would only add non-determinism. |
| **3 — Explain** | Reconciliation results | Traced natural-language answers | **AI, tightly grounded.** The agent answers only from read-only queries against rows the engine produced. |

The product supports two domains against one shared engine:

- **Settlement mode (primary)** — marketplace / payment-processor payouts: gross sale, fees, refunds, chargebacks, net payout.
- **Bank mode (secondary)** — bank statement lines against general-ledger entries.

## 4. Core User Flow

1. **Sign in** with Google.
2. **Create a dataset** and pick a domain (settlement or bank).
3. **Upload sources** — CSVs directly, or PDFs/images that Stage 1 extracts.
4. **Review low-confidence extractions.** Anything the model was unsure about is quarantined here and requires human confirmation before it enters the ledger. It is never silently guessed.
5. **Run reconciliation.** Get a match rate and an exception queue grouped by type.
6. **Interrogate an exception** in plain language — *"why was the payout for ORD-4471 short by ₹412?"* — and receive an answer traced to specific fee and refund lines, with the underlying queries shown.
7. **Check the evaluation page** to see, in numbers, how accurate the system is against known ground truth.

## 5. Success Criteria

The buildathon grades on: a real problem, something that actually runs, judgment about where AI helps versus where it should not be trusted, and honesty about what breaks. Mapped to measurable outcomes:

| # | Criterion | Measure |
|---|---|---|
| SC-1 | It runs, deployed, end to end | A stranger can sign in on the production URL and complete the §4 flow without assistance |
| SC-2 | Matching is accurate | ≥95% recall on planted exceptions, **zero false matches** on known-clean pairs |
| SC-3 | AI judgment is explicit | Every stage states whether it uses AI and why; the review queue and the grounded agent make this visible, not merely documented |
| SC-4 | The agent cannot invent numbers | Asked something the data cannot answer, it declines rather than speculating |
| SC-5 | Accuracy is stated, not asserted | An in-app evaluation page reports precision/recall per exception type against ground truth |
| SC-6 | Limitations are documented | `EVALUATION.md` carries an honest Known Limitations section |

**The differentiating criterion is SC-5.** Most submissions can demo a happy path. Very few can answer *"how do you know it's right?"* with a number.

## 6. Scope

### In scope
- Google sign-in; per-user data isolation enforced at the database level.
- CSV ingestion for both domains; PDF/image extraction with confidence gating.
- Deterministic tiered reconciliation with a fixed, published exception taxonomy.
- Grounded natural-language Q&A over reconciliation results.
- Evaluation page scoring the engine against synthetic ground truth.

### Out of scope (deliberately, and stated so)
- **Live bank or processor API integrations.** File-based ingestion only. Credential handling is a security surface a one-week build should not open.
- **Being a system of record.** Results are advisory analysis, not books. No audit trail guarantees, no immutability, no compliance claims.
- **Multi-currency.** Single currency (INR) per dataset. Mixing currencies is a correctness trap, not a feature gap.
- **Multi-entity / intercompany consolidation.**
- **Forecasting.** Deliberate: projecting future cash is the easiest thing to fake convincingly, and this product's whole thesis is refusing to fake things.
- **Write-back.** The tool never modifies accounting systems.

## 7. Key Product Decisions

**Money is stored as integer minor units (paise), never floats.** Float arithmetic drift in a reconciliation tool is a correctness bug, not a rounding preference.

**The exception taxonomy is frozen before the engine is written.** Engine, UI, and agent all speak one vocabulary. See `DATA_MODEL.md`.

**Low-confidence extraction is quarantined, not guessed.** The review queue is a first-class screen, because it is the visible form of the product's core claim about where AI should not be trusted.

**The reconciliation engine contains no AI, on purpose.** This is a product decision, not an implementation shortcut, and it is stated prominently rather than left for a judge to discover.

**Matching thresholds are shown in the UI.** A tolerance a user cannot see is a magic number they cannot trust.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Six days, solo, nothing cut | Schedule | Phases 1–3 have zero service dependencies; deploy on Day 3 to surface infra problems early |
| Extraction accuracy on poor scans | Demo quality | Confidence gating means poor scans degrade into review items, not wrong numbers — the failure mode is safe and is itself demoable |
| Agent hallucinating figures | Credibility — fatal to the thesis | Grounding constraint plus a scripted unanswerable question in the demo |
| Validated only on synthetic data | Honesty | Stated plainly in Known Limitations rather than glossed |

## 9. Open Questions

- Does the demo need a scripted narrative video, or is a live walkthrough sufficient? *(Confirm against submission requirements.)*
- Should the evaluation page be publicly reachable without sign-in for judge convenience? *(Leaning yes — it exposes no user data.)*
