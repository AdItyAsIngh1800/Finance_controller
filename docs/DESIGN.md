# Design — AI Finance Controller

**Last updated:** 1 September 2026
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
| Type | IBM Plex Sans for UI; **IBM Plex Mono, tabular figures, for all monetary and reference values** |
| Surfaces | Three planes: page ground, raised card, sunk well. Cards carry a hairline border plus a barely-there shadow — the border does the structural work, the shadow only separates the plane |
| Radii | Two tokens only — `--radius-control` for buttons, inputs and badges, `--radius-card` for panels |
| Motion | 150ms `--ease-ui` on hover and focus transitions; 1px press translation. Never gates reading a figure on an animation |
| Density | Compact rows (~36px), sortable headers, sticky table headers |
| Severity | Colour **plus** a text label and icon — never colour alone (`NFR-5.4`) |
| Confidence | Inline bar/percentage on the field; sub-threshold values additionally outlined and labelled |
| Numbers | Right-aligned, consistent 2-decimal display, ₹ prefix, thousands separators |
| Negatives | Parenthesised — `(₹412.00)` — the accounting convention, not a minus sign |
| Empty states | Explain what the screen will show and the single action that fills it |
| Chrome | One sticky header on every signed-in screen: mark, wordmark, nav, signed-in address, sign-out. Breadcrumbs are an ordered list in a labelled `<nav>` |

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
| S-0 | Public overview | `/` (signed out) | The three stages and where the AI is not | P0 |
| S-1 | Sign in | `/signin` | Google OAuth | P0 |
| S-2 | Dataset list | `/datasets` | Create, open, list | P0 |
| S-3 | Dataset detail / upload | `/datasets/[id]` | Upload both sides, trigger run | P0 |
| S-4 | Extraction review | `/datasets/[id]/review` | **The human gate** | P0 |
| S-5 | Reconciliation dashboard | `/datasets/[id]/runs/[runId]` | Match rate, breakdown, parameters | P0 |
| S-6 | Exception queue | same, primary panel | Filterable, expandable findings | P0 |
| S-7 | Ask (Q&A) | side panel on S-5/S-6 | Grounded agent + call trace | P0 |
| S-8 | Evaluation | `/evaluation` | Accuracy vs ground truth | P0 |
| S-9 | Reconciliations | `/reconciliations` | Every run, across datasets | P1 |
| S-10 | Exceptions | `/exceptions` | Every finding, across runs | P1 |
| S-11 | Settings | `/settings` | Account, and the published thresholds | P1 |
| S-12 | Formats | `/formats` | The file shapes the adapters accept | P1 |

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
- **Responsive from 320px up.** Verified free of horizontal page overflow at 320, 360, 390, 414, 768, 1024, 1280 and 1440px.
- Where a table's columns mean something only next to each other — precision/recall, the exception evidence comparison — it scrolls inside its own container rather than reflowing, and the page body never scrolls sideways. Where rows are independent records, as in the dataset list, each row is restated as a card below `md`.

---

## 7. Deliberately Excluded

| Excluded | Why |
|---|---|
| Charts and graphs | The interesting data is tabular. A pie chart of exception types is decoration, not insight. |
| Onboarding tour | The demo is guided; a tour would be built for nobody |
| Exception assign/comment/close | Real product need, no grading value in one week (`DATA_MODEL.md` §7) |

### 7.1 Reversed on 1 September 2026

Two exclusions above were lifted deliberately, not drifted past.

| Previously excluded | Now | Reasoning |
|---|---|---|
| **Mobile layout** — "reconciliation is desktop work" | Responsive from 320px | The claim was about where the *work* happens, and it still holds: nobody clears an exception queue on a phone. But checking a match rate or reading an explanation on the way to a meeting is ordinary, and a layout that breaks at that moment reads as unfinished regardless of how good the desktop view is. Density at desktop width is unchanged — the reflow only engages below `md`. |
| **Animated transitions** — "density and speed over polish" | 150ms hover/focus transitions | The concern was animation delaying a reading, and that is still enforced: nothing animates on load, nothing defers content, and `prefers-reduced-motion` drops every duration to near-zero. What was added is pointer feedback on controls, which makes the interface feel responsive rather than slower. |
| **Dark mode** — "non-trivial cost across dense tables" | Full dark theme | The cost was real but it was a cost of *duplicating* colours, and the token layer added on the same day removes it: every screen already reads its colour through a variable, so a second theme is one block of values rather than a second stylesheet. The dense-table concern was addressed by re-deriving the palette rather than inverting it — see §7.2. |

Density itself was **not** reversed. §1's "dense, not decorated" still governs: rows stay compact, whitespace was regularised into a scale rather than enlarged.

### 7.1.1 Reversed on 2 September 2026

| Previously excluded | Now | Reasoning |
|---|---|---|
| **No landing page** — "a working tool shows the product or the door to it" | Public overview at `/` for signed-out visitors (S-0) | The claim was about *users*, and for a user it still holds — signed in, `/` still goes straight to the dataset list. It stopped holding once the first visitor became a reviewer, who arrives with no account and whose question is not "how do I get in" but "what is this and why should I believe it". `PRD.md` §5 SC-3 requires the AI judgment be visible in the product rather than only in the documents, and a login form makes it visible to nobody. The page carries one argument — the three stages and which of them has no model — and two ways out: `/evaluation` and sign-in. It is not marketing: no testimonials, no feature grid, no call to action beyond the two links. |
| **Charts and graphs** — still excluded | — | Unchanged, and re-confirmed while adding S-0. A pie chart of exception types remains decoration; the overview states the pipeline in words and a single inverted band, not in a diagram library. |

The exception queue gained a **CSV export** of the currently filtered rows in the same pass. This is not a reversal of the assign/comment/close exclusion above: it adds no state, no workflow and no second source of truth. It ends the tool's responsibility at the point where the work leaves it for a spreadsheet, which is where clearing a queue actually continues.

An expanded finding is now addressable as `?exception=<id>`, resolved server-side so the row is open in the first paint. A finding that cannot be linked cannot be handed to the person who has to act on it.


### 7.1.2 Reversed on 3 September 2026

A second, larger pass, taken on external design review. Four exclusions lifted, each for a stated reason rather than by drift.

| Previously excluded | Now | Reasoning |
|---|---|---|
| **Ledger paper palette** — warm stock, red for money unaccounted for | Charcoal-navy ground, amber/blue/teal semantics, no red anywhere | The argument against red: an exception here is a normal part of the workflow rather than a fault, and a queue of red rows reads as a system in trouble instead of a day's work. What was **not** accepted was collapsing every exception to one amber — that would destroy the high/low split §1 calls the queue's most useful property. The three-way encoding is kept and re-hued: amber flagged, blue awaiting a decision, grey explained, teal settled, which is also the dashboard's status vocabulary. Every pair was measured before adoption; the light theme is derived from the dark hues rather than the reverse. |
| **IBM Plex Sans + Plex Mono** | Space Grotesk + Inter, two faces total | The load-bearing property was never the monospace face but column-aligned digits, and Inter ships true tabular figures. `--font-mono` now resolves to Inter, so figures still align and codes no longer look typewritten — the accepted cost of a two-face system. |
| **Charts and graphs** — "the interesting data is tabular" | Three charts on the run dashboard | Two constraints kept from the original argument. **No pie**: the exception breakdown is a ranking, so it is a horizontal bar chart, where lengths are compared instead of angles. **Nothing plotted that is not measured**: the trend chart plots one point per actual run, not a synthetic calendar, and a dataset run once says so rather than inventing thirty days of history. The confidence histogram is the one chart that argues something the tables cannot — a model with flat confidence could not be gated, however accurate. |
| **Exception assign/comment/close** — "no grading value in one week" | A three-state `status` on each exception | Only the state, not the workflow: no assignee, no comment thread, no audit trail. Severity stays the engine's and is never edited; status is the one field a person may change, and it is a separate column so the run's own output remains reproducible. Runs stay append-only — status is an annotation on a frozen result. |

The signed-in surface moved from a top bar to a **sidebar** (S-9 to S-11) at the same time, and the run dashboard gained four summary cards including the reconciled *value*, which no screen previously showed.


### 7.1.4 Rebranded 4 September 2026

The neutral ledger grey was replaced by a supplied palette — Midnight Ink, forest, brass, oxblood, parchment — and the interface was rederived from it rather than tinted with it. The submission was already in, so this is portfolio work with no clock.

**Every colour was measured before any of it was built**, and two could not do the job they were given.

| Finding | Consequence |
|---|---|
| **Oxblood `#5A2528` is not a text colour on dark** — 1.54:1 on Midnight Ink, 1.33:1 on Deep Forest. It has almost the same luminance as the grounds it would sit on. | It became the *fill*. `--unaccounted-wash` is Oxblood and the label on it is a dusty rose derived by desaturating and lifting, which clears 5.20:1. Scaling Oxblood up to reach AA instead lands near `#ea6068`, a bright coral — the exact register this palette exists to avoid. |
| **Muted Green `#63745E` fails as text** — 3.73:1 on Midnight Ink. | Lightened to `#8AA183` for text; the original stays for bars and chart fills, which are not text. |
| **Parchment was the wrong low-severity colour.** At 10.18:1 it is the most luminous value in the palette, so the low-severity bar on the exceptions chart shouted louder than the high-severity ones. | `--explained` is `#B0A794` — dimmer than body text, still 6.79:1 on the card. The least urgent finding is now the quietest mark on the screen. |

**The light theme was derived, not dropped.** Parchment is the ground and Antique Cream the card, so panels still lift above the desk as they do in dark. Brass and Muted Green are darkened until they clear **4.8:1** — 4.8 rather than 4.5 because §7.2 already records a badge landing on exactly 4.50 and flickering under sub-pixel rounding. Two honest limits: the two golds converge once darkened for AA, so light carries one brass and the Brass/Antique-Gold distinction is a dark-theme affordance only; and the brief mentioned an ocean blue that the supplied palette does not contain, so there is no blue anywhere.

**The mark was kept and redrawn.** Two entries closing to a double rule is the bookkeeping notation for a final figure — it already meant something. What changed: the four strokes were evenly spaced and near-equal, which read as a hamburger menu, so the entries are now light and unequal with a clear gap before a heavier closing pair. It is a brass plate with the glyph cut out of it, in both themes, via `--brand-ground` and `--brand-mark`, which deliberately do not flip: a logo that inverts is two logos. Drawn the other way round the tile was Midnight Ink on a Midnight Ink page and simply disappeared.

**The type is a serif/sans pairing.** Cormorant Garamond replaced Space Grotesk on 4 September: a geometric sans was the wrong voice for a palette of aged paper, brass and oxblood. It is scoped to `h1` and an opt-in `.display` class, **not** to every heading. Cormorant has a small x-height and high stroke contrast, so at the 14px this interface uses for card headings and the 10px it uses for print-report labels, the strokes thin until a heading reads lighter than the paragraph beneath it. Everything below a page title stays on Inter, which also keeps `--font-mono` and therefore the tabular figures the money columns depend on. Two corrections the swap forced: `letter-spacing` returned to `normal` (tightening corrects a geometric sans and closes a garalde's counters), and page titles stepped up one size, because Cormorant renders optically smaller than Inter at the same pixel size.

**The hero is a ledger, and the match animation is gone.** The animated demonstration of two records snapping together was deleted outright rather than moved. It showed what the product does; the ledger shows what the product is *for*, and on a page whose argument is that matching is ordinary deterministic code, a moving graphic was the wrong register. The hero is now ruled paper — 2rem ruling with an oxblood margin rule — carrying four specimen entries that close on a double rule, the same notation the mark draws.

Two things that had to be got right. The **ruling rhythm and the entry height are the same 2rem**, because drawn independently they read as lines behind text rather than as a ledger. And the specimen entries are `aria-hidden` and carry no label that could be read as a claim: four genuinely measured figures sit a few hundred pixels below them, and a decorative number mistaken for a measured one is exactly the failure `/evaluation` exists to rule out. Vertical column rules were tried and removed — placed a fixed distance from the right edge they landed nowhere near the amounts, and a rule that bounds no column is a stray line.

**Accepted cost:** nothing on the landing page demonstrates the matching any more. The page argues in words and figures instead. Deleting the animation also leaves it with no non-hover motion at all, which is closer to §7.1's original position than it has been since the animation was added.

**The landing page now declares instead of introducing.** The headline is the motto at `text-6xl`, followed by one line — *reconciliation you can audit line by line, with no model anywhere near the matching* — and the descriptive paragraph moved below the figures, where it explains something a reader has a reason to want.

Also in this pass: fields sit on the sunk plane so they read as slots rather than outlines; the primary action is brass, the palette's "important CTA"; `/exceptions`, `/reconciliations` and `/settings` gained the loading skeletons they shipped without; and the dataset list shows each dataset's latest run, so reaching a result is one navigation instead of three.

---

### 7.1.3 Added 3 September 2026

| Added | Why |
|---|---|
| **Printable reconciliation summary** (S-5) | The step after clearing a queue is sending someone a document. Rendered as separate static markup rather than by printing the live DOM, because the queue's expanded state is React state — printing the screen would produce a report containing whichever findings happened to be open, and a report that silently omits findings is worse than none. No PDF library: the browser's print-to-PDF gives selectable text, working links and the reader's own paper size. Colour is dropped in print, which is safe precisely because §2 requires a text label beside every severity colour. |
| **`/formats`** (S-12) | Built *instead of* a proposed "Integrations" page carrying Stripe, Razorpay, PayPal and bank logos. There are no live API integrations — §6 of `PRD.md` excludes them deliberately — and a "Works with" wall of third-party marks would claim a capability and a relationship that do not exist, to an audience specifically judging what is real. The honest version answers the same question better: the exact columns each adapter requires, what each is used for, and the limits. |
| **Per-user rate limiting** on the two model routes | Extraction and Q&A were reachable as fast as a key could be held down. In-memory and therefore per-instance — a stated ceiling, not a hidden one. |
| **Data-retention statement** on Settings | Says what is stored, who can read it, that deleting a dataset removes the files and cascades, and — honestly — that there is no automatic expiry. |
| **CI** | `README`/`CLAUDE.md` recorded "no CI" as right for a solo six-day build. That held while one person was the only committer; it stops holding when the repository is being read by someone deciding whether to trust it, because a green check is evidence they can see. |### 7.2 The dark theme

**Preference model.** Three states. `system` follows `prefers-color-scheme` and is the default; `light` and `dark` pin the choice. A two-state toggle was rejected because once clicked it can never return to following the OS — a viewer who flips it to look at something has silently opted out of their machine's evening switch, with no way back. The stored value is the *preference*, never the resolved theme, so someone who chose `system` in daylight still gets dark at night. `system` is stored as the absence of a key, so "never touched the control" and "explicitly chose to follow the OS" are the same state.

**No flash.** A small script in `<head>` resolves the preference to a `data-theme` attribute on `<html>` before first paint. Resolving it in a React effect instead would paint light and then repaint, which is what makes a dark mode feel broken. The `<html>` element carries `suppressHydrationWarning` for exactly this reason — server markup has no attribute, the hydrated DOM does — and the suppression is scoped to that one element.

**One source of values.** The dark palette exists only under `[data-theme="dark"]`, not additionally inside a `prefers-color-scheme` media query. Duplicating it would be pure CSS but would put thirty-odd colours in two places. The trade-off: with JavaScript disabled the interface stays light, which costs nothing because auth, upload and every control already require JavaScript.

**Re-derived, not inverted.** Three things are chosen rather than flipped:

- The ground is the darkest plane and cards lift *above* it, preserving the light theme's "panels are objects on a desk" relationship. Inverting would sink cards below the page and read as holes.
- Ink is `#ecedeb`, not white — pure white haloes at the small sizes used for figures.
- The four semantic colours are re-picked to clear 4.5:1 against the card **and** against their own wash, because a severity badge puts the colour on the wash.

**Measured.** Against the card plane: ink 14.3:1, ink-muted 6.8:1, unaccounted 6.7:1, undecided 8.9:1, settled 8.4:1. Hairlines sit at 1.5:1 and 2.2:1, proportionate to the 1.3:1 and 1.7:1 they hold in light — a rule is meant to be felt, not read.

**`--ink-faint` is not a text colour.** It is for decorative marks only — disclosure arrows, breadcrumb separators, the ⚙ before a call trace — every one of which is `aria-hidden`. It sits deliberately below the 4.5:1 floor, and the palette has no room to raise it: a value clearing the floor on the sunk plane is indistinguishable from `--ink-muted`. Readable text takes `--ink-muted`.

**Verified** with axe-core 4.12.1 (`wcag2a,wcag2aa`): zero violations on every route in both themes.
