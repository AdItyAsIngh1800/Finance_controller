# Design — AI Finance Controller

**Last updated:** 29 August 2026
**Purpose:** Screen inventory, flows, and interaction states, specified before Day 4 so the UI is built rather than improvised.

---

## 1. Design Principles

**The exception queue is the product.** The match rate is a headline; the queue is where a controller actually works. Everything else is navigation to it.

**Show the reasoning, not just the verdict.** Every match names the tier that produced it. Every exception carries a plain-English reason and the numbers behind it. Every agent answer shows which functions it called. A finding a user cannot audit is a finding they cannot sign off.

**Uncertainty is visible, never smoothed over.** Low-confidence extractions look different from confirmed ones. A blocked record looks blocked. The interface never renders a guess as a fact.

**Dense, not decorated.** This is a working tool for someone who lives in spreadsheets. Tabular density and legible numbers over generous whitespace and illustration.

**Money is monospaced and right-aligned, always.** Column-aligned digits are how a finance user scans for anomalies. Proportional fonts defeat that, and defeating it in a reconciliation tool is a real usability failure, not an aesthetic one.

---

## 2. Visual Language

| Element | Decision |
|---|---|
| Type | System sans for UI; **tabular-figure monospace for all monetary and reference values** |
| Density | Compact rows (~36px), sortable headers, sticky table headers |
| Severity | Colour **plus** a text label and icon — never colour alone (`NFR-5.4`) |
| Confidence | Inline bar/percentage on the field; sub-threshold values additionally outlined and labelled |
| Numbers | Right-aligned, consistent 2-decimal display, ₹ prefix, thousands separators |
| Negatives | Parenthesised — `(₹412.00)` — the accounting convention, not a minus sign |
| Empty states | Explain what the screen will show and the single action that fills it |

**Severity encoding** (from the frozen taxonomy in `DATA_MODEL.md` §3.4):

| Severity | Meaning | Encoding |
|---|---|---|
| **High** | Money unaccounted for | Red badge · `High` label · filled dot |
| **Medium** | Needs a human decision | Amber badge · `Medium` label · half dot |
| **Low** | Explained discrepancy — money accounted for | Grey badge · `Low` label · hollow dot |

That low/high split is the queue's most useful property: a timing difference and a missing payout are both "exceptions," and treating them as equally alarming would make the queue noise.

---

## 3. Screen Inventory

| # | Screen | Route | Purpose | Priority |
|---|---|---|---|---|
| S-1 | Sign in | `/signin` | Google OAuth | P0 |
| S-2 | Dataset list | `/datasets` | Create, open, list | P0 |
| S-3 | Dataset detail / upload | `/datasets/[id]` | Upload both sides, trigger run | P0 |
| S-4 | Extraction review | `/datasets/[id]/review` | **The human gate** | P0 |
| S-5 | Reconciliation dashboard | `/datasets/[id]/runs/[runId]` | Match rate, breakdown, parameters | P0 |
| S-6 | Exception queue | same, primary panel | Filterable, expandable findings | P0 |
| S-7 | Ask (Q&A) | side panel on S-5/S-6 | Grounded agent + call trace | P0 |
| S-8 | Evaluation | `/evaluation` | Accuracy vs ground truth | P0 |

---

## 4. Screen Specifications

### S-1 · Sign in

Product name, one-line description, then two paths separated by a rule:

- **Continue with Google** — the primary path, one click, no credentials to invent.
- **Email and password** — so the application is usable without a Google account, and so more than one account can be created on demand. The row-level-security isolation test needs two distinct accounts, and this is how they are made.

Both produce an ordinary Supabase session, so middleware, RLS and `getCurrentUser()` behave identically regardless of which was used.

*States:* idle · redirecting (Google) · working (credentials) · notice (account created, confirmation pending) · error (with the provider's own message, not a generic one).

---

### S-3 · Dataset detail / upload

Two symmetric upload panels side by side, labelled by role rather than by jargon:

```
┌─ External source ────────────┐  ┌─ Internal ledger ────────────┐
│ Settlement report            │  │ Revenue / GL export          │
│ [ Drop CSV, PDF, or image ]  │  │ [ Drop CSV, PDF, or image ]  │
│ 3 files · 248 records        │  │ 1 file · 250 records         │
└──────────────────────────────┘  └──────────────────────────────┘

⚠ 4 extractions need review before reconciliation   [ Review → ]

[ Run reconciliation ]        ← disabled while items await review
```

**The run button is disabled while anything sits in review**, with the reason stated inline. This is the human gate enforced in the interface, not merely in the backend — a user should feel the boundary, not just be subject to it.

*States:* empty (no files) · uploading (per-file progress) · extracting (per-file spinner) · review-blocked · ready · running · complete · error.

---

### S-4 · Extraction review — **the human gate**

The screen where the product's central claim becomes visible. Split view:

```
┌─ Document ─────────────┐ ┌─ Extracted fields ──────────────────┐
│                        │ │ Order ref    ORD-4471      ████ 98% │
│  [ PDF / image         │ │ Date         2026-08-14    ████ 96% │
│    preview,            │ │ Gross        ₹1,250.00     ████ 99% │
│    zoomable ]          │ │ Fees         ₹37.50        ██▒▒ 62% │ ← flagged
│                        │ │ Net          ₹1,212.50     ███▒ 71% │ ← flagged
│                        │ │                                      │
│                        │ │ 2 fields below 85% confidence.       │
│                        │ │ This record is blocked from the      │
│                        │ │ ledger until confirmed.              │
│                        │ │                                      │
│                        │ │ [ Confirm all ] [ Correct ] [ Reject ]│
└────────────────────────┘ └──────────────────────────────────────┘
```

Design commitments:

- Document and fields are **side by side** — verification requires seeing both without switching context.
- Flagged fields are **editable in place**; confirmed fields are read-only until explicitly unlocked.
- The blocking message states the consequence in plain language, not a status code.
- Confidence is shown as a bar **and** a number — the bar for scanning, the number for judgment.

*States:* queue empty (success message, return link) · reviewing · saving · extraction failed (error, no fields, ledger untouched).

---

### S-5 · Reconciliation dashboard

```
Match rate                      Exceptions by type
┌──────────┐                    UNMATCHED_SOURCE      3  High
│  94.2%   │  236 / 250         AMOUNT_MISMATCH       2  High
└──────────┘                    FEE_VARIANCE          1  High
                                DUPLICATE_SUSPECTED   2  Medium
Matched by tier                 TIMING_DIFFERENCE     5  Low
  Exact reference       198     PARTIAL_PAYMENT       1  Low
  Amount + date          24
  Fuzzy reference        11     Matching parameters        [ ⓘ ]
  Partial set             3       Date window      ± 3 days
                                  Amount tolerance ± 0.5% or ₹1
                                  Ref similarity   ≥ 0.85
```

**Match rate is the single largest element on the page** — it is the number a judge and a controller both look for first.

**Matched-by-tier is shown, not hidden.** It communicates that matching is a transparent mechanism with gradations of confidence rather than an opaque verdict.

**The parameters panel is always visible**, not behind a settings modal. Read-only, showing the values this run actually used (from `recon_runs.params`). Thresholds a user cannot see are magic numbers they cannot trust.

---

### S-6 · Exception queue

```
Filter: [ All types ▾ ] [ All severities ▾ ]              14 exceptions

▸ High   UNMATCHED_SOURCE   ORD-4502   no ledger counterpart
▾ High   AMOUNT_MISMATCH    ORD-4471   ₹800.50 vs ₹1,212.50    (₹412.00)
    ┌────────────────────────────────────────────────────────────┐
    │ Stated reason                                              │
    │ The processor netted a ₹412.00 refund out of this payout   │
    │ that the ledger never recorded.                            │
    │                                                            │
    │ Evidence            Source          Ledger                 │
    │   Gross           ₹1,250.00       ₹1,250.00                │
    │   Fees               ₹37.50          ₹37.50                │
    │   Refunds           ₹412.00           ₹0.00   ← difference │
    │   Net               ₹800.50       ₹1,212.50                │
    │                                                            │
    │ Suggested action                                           │
    │ Confirm whether the refund was recorded in the ledger.     │
    │                                          [ Ask about this ]│
    └────────────────────────────────────────────────────────────┘
▸ Low    TIMING_DIFFERENCE  ORD-2210   settled 2 days after sale
```

- **Sorted by severity, then amount.** High-value unexplained gaps surface first.
- **Expansion shows both sides with the differing line marked** — the comparison is the explanation.
- `stated_reason` is a sentence. Never a code, never a template with slots showing.
- **"Ask about this"** opens S-7 pre-loaded with the exception in context, connecting the deterministic finding to the explanation layer.

*States:* no exceptions (a genuine success state — say so warmly, do not render an empty table) · filtered-to-empty · loading.

---

### S-7 · Ask — grounded Q&A

Side panel, so the queue stays visible while asking.

```
┌─ Ask about this reconciliation ────────────────┐
│                                                │
│ You  Why was the payout for ORD-4471 short     │
│      by ₹412?                                  │
│                                                │
│ ⚙ getSettlementBreakdown(recordId: "ORD-4471") │
│ ⚙ getExceptionDetail(exceptionId: "exc_18")    │
│                                                │
│ The ₹412.00 gap is a refund. The processor     │
│ netted a ₹412.00 refund out of the payout,     │
│ but the ledger records no matching refund      │
│ entry.                                         │
│                                                │
│   Gross      ₹1,250.00                         │
│   Fees          ₹37.50                         │
│   Refunds      ₹412.00  ← not in ledger        │
│   Net          ₹800.50  (ledger: ₹1,212.50)    │
│                                                │
│ [ Ask a follow-up… ]                           │
└────────────────────────────────────────────────┘
```

**The function-call trace is shown by default, above the answer, not tucked behind a disclosure.** It is the evidence that the answer came from data rather than from the model's imagination — the most important pixels on the screen for this project's thesis.

**Refusals are rendered as a normal, calm answer**, not as an error:

> *"I can't answer that. Forecasting future payouts isn't something this data supports — I can only report on reconciliation results that have already run."*

*States:* idle (with 3 suggested questions, one per demo script) · thinking · streaming · refused · error (Gemini unavailable — panel degrades, rest of the app unaffected).

---

### S-8 · Evaluation

Publicly reachable without sign-in — it exposes no user data and saves a judge an account.

```
Engine accuracy vs. ground truth        Ground truth: 250 pairs, 16 planted

Exception type          Planted  Found  Precision  Recall
UNMATCHED_SOURCE              3      3      1.00    1.00
AMOUNT_MISMATCH               2      2      1.00    1.00
FEE_VARIANCE                  1      1      1.00    1.00
DUPLICATE_SUSPECTED           2      2      1.00    1.00
TIMING_DIFFERENCE             5      5      1.00    1.00
PARTIAL_PAYMENT               1      1      1.00    1.00
────────────────────────────────────────────────────────
False matches on clean pairs: 0        ← the number that matters most

Known limitations
• Validated on synthetic data only — never tested on a real bank statement.
• Subset-sum bounded to 3 records; a payment split 4+ ways is missed.
• Single currency per dataset.
```

**Known limitations sit on the page, not in a linked document.** A tool that states its own boundaries is more trustworthy than one that requires you to find them — and the track explicitly grades honesty about what breaks.

---

## 5. Cross-Cutting States

Specified once; every screen implements them.

| State | Rule |
|---|---|
| **Empty** | Say what will appear here and give the one action that fills it. Never a bare "No data." |
| **Loading** | Route-level skeletons shaped like the content they replace, so the layout does not shift when data arrives. The skeleton is `aria-hidden`; a visually-hidden status message carries the announcement, since decorative bars read as noise. Inline pending text for actions. No full-page blockers. |
| **Error** | What failed, whether data was affected, what to do next. Extraction errors always state *"your ledger was not modified."* |
| **Blocked** | Disabled controls always state the reason inline (e.g. *"4 extractions need review"*), never silently grey out. |
| **Degraded** | Gemini unavailable disables the Ask panel only; dashboard and queue remain fully functional. |

---

## 6. Accessibility Commitments

- Colour never carries meaning alone — severity always pairs with a label and icon.
- All interactive elements keyboard reachable with a visible focus ring.
- Tables use real `<table>` semantics with scoped headers, not styled `<div>`s.
- Confidence conveyed numerically as well as visually.
- Expandable rows use proper `aria-expanded` disclosure semantics.
- Target 1280px and above; below that, tables scroll horizontally within their container rather than reflowing into unreadable stacks.

---

## 7. Deliberately Excluded

| Excluded | Why |
|---|---|
| Dark mode | Zero grading value; non-trivial cost across dense tables |
| Charts and graphs | The interesting data is tabular. A pie chart of exception types is decoration, not insight. |
| Mobile layout | Reconciliation is desktop work |
| Onboarding tour | The demo is guided; a tour would be built for nobody |
| Animated transitions | Density and speed over polish |
| Exception assign/comment/close | Real product need, no grading value in one week (`DATA_MODEL.md` §7) |
