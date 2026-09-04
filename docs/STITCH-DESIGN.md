# Design System: AI Finance Controller

**Purpose:** a generation brief for Google Stitch (and usable verbatim in v0).
It encodes the design system this project already runs, in Stitch's semantic
language, so generated screens land inside the system instead of inventing one.

**`docs/DESIGN.md` remains authoritative.** Where the two disagree, that file
wins and this one is stale. This document adds nothing new about colour or
typography; it restates them for a generator, and contributes layout, component,
motion and anti-pattern rules that were previously implicit.

Every hex below is read from `src/app/globals.css`. Every contrast ratio was
measured, not asserted. Every exception name comes from `src/core/taxonomy.ts`,
which is a frozen vocabulary shared verbatim by the engine, the Postgres enum,
the queue UI and the agent.

---

## 0. What the product is

A reconciliation tool. It matches an external record (a payment-processor
settlement or a bank statement) against an internal ledger, and for every
discrepancy states *why*. The valuable output is not the list of things that
matched. It is the residue: what did not match, and a defensible reason.

The user is a finance controller. They live in spreadsheets, they are
accountable for the numbers being right, and they cannot sign off on a figure
they cannot explain.

Three stages, and the interesting claim is about the middle one:

| Stage | Job | Model? |
|---|---|---|
| Extract | messy PDFs and photographs into structured records | yes, confidence-gated at 0.85 |
| **Reconcile** | **records into matches and categorised exceptions** | **no, deliberately** |
| Explain | results into traced answers | yes, read-only lookups only |

**The interface's whole job is to never render a guess as a fact.** Uncertainty
is visible. Thresholds are published, not hidden behind a settings modal.
Accuracy is measured on a public page rather than claimed in a headline. Design
choices that soften, smooth, or decorate uncertainty are wrong here, however
attractive.

---

## 1. Visual Theme & Atmosphere

Aged paper and brass. A ledger from a good accountant's office: warm stock,
ruled lines, ink that has settled, a brass plate on the door. Nothing gleams.
The atmosphere is quiet and exact rather than clinical, and it is deliberately
not the dark-neutral-plus-neon register that every other analytics tool occupies.

**Two registers, because the product has two audiences.** A reviewer landing on
the public pages and a controller working the exception queue want opposite
things, and one setting cannot serve both.

| | Public pages (`/`, `/docs`, `/formats`, `/evaluation`) | App surface (everything behind sign-in) |
|---|---|---|
| Density | 4 — daily-app balanced | 8 — cockpit dense |
| Variance | 7 — offset, asymmetric | 3 — predictable, symmetric |
| Motion | 6 — fluid | 2 — static, restrained |

The app surface is symmetric and dense on purpose. A controller scanning a
column of figures for an anomaly is doing visual diffing, and asymmetry actively
sabotages that. Save the compositional interest for the pages where someone is
reading rather than working.

Density 8 on the app surface triggers the monospace-figures rule. See §3.

---

## 2. Colour Palette & Roles

Four tonal ramps plus a sage, anchored on the two colours in the logo mark.
Every semantic token is an alias pointing at a ramp step, so two adjacent planes
are related by construction rather than matched by eye.

**Ramp steps are raw material and are not all safe as text.** Only values
assigned to a text token below have been checked. `forest-500` is 1.58:1 on the
card and exists for borders alone.

### The ramps

- **Forest** — `#11130f` · `#151e18` · `#18231c` · `#24372b` · `#2f4638`
- **Brass** — `#393220` · `#625331` · `#b08a4a` · `#c5a15b` · `#d5bd8c`
- **Parchment** — `#c9bb9d` · `#d8ccb2` · `#e9dfc9` · `#f2ebda`
- **Oxblood** — `#391d1d` · `#5a2528` · `#c2a89c`
- **Sage** — `#4a5746` · `#93aa8c` · wash `#1d2a20`

### Dark theme — the theme the ramps were designed from

- **Midnight Ink** (`#11130f`) — page ground, the darkest plane
- **Deep Forest** (`#18231c`) — card fill, lifts above the ground
- **Raised Forest** (`#24372b`) — the plane above a card
- **Sunk Forest** (`#151e18`) — wells: inputs, code blocks, evidence tables
- **Cream** (`#e9dfc9`) — primary text. Not white: pure white haloes at figure sizes
- **Muted Cream** (`#b0a794`) — secondary text, labels, metadata
- **Faint** (`#6f6f60`) — **decorative marks only**, see the warning below
- **Hairline** (`#24372b`) / **Hairline Strong** (`#2f4638`) — structural rules
- **Brass** (`#b08a4a`) — links, accent
- **Antique Gold** (`#c5a15b`) — the single "spend sparingly" accent: primary CTA, the match rate, figures that matter

### Light theme — derived from the dark hues, not inverted

- **Parchment** (`#d8ccb2`) — page ground
- **Aged Paper** (`#e9dfc9`) — card fill
- **Antique Cream** (`#f2ebda`) — the raised plane
- **Sunk Parchment** (`#c9bb9d`) — wells
- **Midnight Ink** (`#11130f`) — primary text
- **Muted Forest** (`#4a5647`) — secondary text
- **Faint** (`#8a8570`) — decorative only
- **Hairline** (`#c4b79b`) / **Hairline Strong** (`#a89a7e`)
- **Dark Brass** (`#66502b`) — links, accent
- **Deep Brass** (`#62502d`) — primary CTA

Cards lift *above* the ground in both themes. Inverting that relationship in
dark would sink cards below the page and read as holes.

### Severity signals — functional, not decorative

Four signal colours sit alongside the single brand accent. This is a deliberate
override of the one-accent rule: severity is a functional requirement of the
exception queue, and collapsing it would destroy the high/low split that makes
the queue usable rather than merely long.

| Role | Dark text / wash | Light text / wash | Meaning |
|---|---|---|---|
| **Unaccounted** | `#c2a89c` on `#5a2528` | `#5a2528` on `#ead9c9` | money unaccounted for |
| **Undecided** | `#c5a15b` on `#393220` | `#62502d` on `#e6dcc0` | needs a human decision |
| **Explained** | `#b0a794` on `#24372b` | `#4a5647` on `#ded2b8` | discrepancy explained, money accounted for |
| **Settled** | `#93aa8c` on `#1d2a20` | `#4a5746` on `#d9d7bc` | reconciled, resolved |

**The lowest-severity mark must be the quietest thing on the screen.** Explained
is dimmer than body text on purpose. An earlier version used the most luminous
value in the palette for it, and the low-severity bar shouted louder than the
high-severity ones.

**Oxblood is never text on dark.** `#5a2528` is 1.54:1 on the page — almost the
same luminance as the grounds it would sit on. It is the *fill*, and `#c2a89c`
is the tint that sits on it. Severity on dark is a filled chip, never coloured
text. Scaling oxblood up to reach AA lands near a bright coral, which is exactly
the register this palette exists to avoid.

### Measured

Contrast against the card plane. Verified against the live token values.

| Token | Dark (on `#18231c`) | Light (on `#e9dfc9`) |
|---|---|---|
| Primary text | 12.24:1 | 14.11:1 |
| Secondary text | 6.79:1 | 5.85:1 |
| Accent (CTA) | 6.65:1 | 5.87:1 |
| Unaccounted | 7.23:1 | 9.17:1 |
| Undecided | 6.65:1 | 5.87:1 |
| Explained | 6.79:1 | 5.85:1 |
| Settled | 6.46:1 | 5.78:1 |

Every severity also clears AA against **its own wash chip**, which is where it
actually renders: dark 5.22–5.96:1, light 5.17–8.82:1.

Saturations run 10%–48%, well under the 80% ceiling. **No screen surface uses
pure black** — the darkest value in either theme is `#11130f`. Pure black appears
only in the print override, where it is correct.

Light-theme accents are darkened until they clear **4.8:1**, not 4.5:1, because
a badge in this project once landed on exactly 4.50 and flickered under
sub-pixel rounding.

### Two hard rules for a generator

**Faint is not a text colour.** It measures 3.18:1 dark and 2.80:1 light. It is
for decorative marks only — disclosure arrows, breadcrumb separators, the glyph
before a call trace — every one of which is `aria-hidden`. Readable secondary
text takes Muted Cream / Muted Forest. Do not use Faint for placeholder text,
timestamps, helper text, or disabled labels.

**Brass `#b08a4a` must not carry text on the raised plane `#24372b`** — 3.97:1.
The raised plane takes Antique Gold or Cream instead.

**The accent and the Undecided signal are currently the same hex** (`#c5a15b`
dark, `#62502d` light). Never let a primary CTA and a "needs a human decision"
badge be told apart by colour alone: the CTA is a filled control with a radius
and a press state, the badge is a wash chip carrying a text label and a shape.
If they would ever sit in the same visual group, separate them by form.

### The mark

Two vertical columns brought to one baseline, closing on a double rule — the
bookkeeping notation for a final figure. It is Antique Gold on Midnight Ink and
**does not flip between themes**: a logo that inverts is two logos. Stroke
weight steps up at small sizes, because a weight correct at 96px disappears in
a browser tab. Nothing built from a horizontal stack is acceptable — at 28px it
is indistinguishable from a hamburger menu.

---

## 3. Typography Rules

**Two faces, and only two.**

- **Display — Cormorant Garamond**, weights 500/600/700. Scoped to `h1` and an
  opt-in `.display` class. **Nothing else.**
- **Body — Inter**, weights 400/500/600. Everything below a page title,
  including every card heading, every table, and every figure.

**The serif is scoped tightly, and the scope is load-bearing.** Cormorant has a
small x-height and high stroke contrast. At the 14px this interface uses for
card headings and the 10px it uses for print-report labels, its strokes thin
until a heading reads *lighter* than the paragraph beneath it. It was previously
applied to `h1, h2, h3` and had to be narrowed. Do not widen it back.

Two corrections the serif forces, both mandatory:

- `letter-spacing: normal` on display text. Tightening corrects the loose
  sidebearings of a geometric sans; applied to a garalde it closes the counters
  and muddies word shapes.
- Page titles step up one size, because Cormorant renders optically smaller than
  Inter at the same pixel size.

**Figures.** `font-variant-numeric: tabular-nums` is set on `body`, so every
number in the interface is column-aligned. The `--font-mono` token resolves to
Inter, and the `font-mono` class marks "this is a figure or a code" rather than
selecting a typewriter face. The density-8 monospace-figures requirement is met
by tabular alignment, which is the property that actually matters: it is what
lets an eye run down a column looking for the digit that is out of place.

**Body measure** is capped at 68 characters (`.prose-measure`).

**The eyebrow is a label, not a heading**, even when it sits on an `h2`. 11px,
600, uppercase, `0.14em` tracking, secondary colour, body face.

---

## 4. Component Stylings

Map to what exists in `src/components/ui.tsx`: `Card`, `Button`, `Field`,
`Notice`, `EmptyState`, `PageShell`, `SectionHeading`, `TableScroller`, `Mark`.

**Surfaces — three planes.** Page ground, raised card, sunk well. A card carries
a hairline border **plus** a barely-there shadow: the border does the structural
work, the shadow only separates the plane. On dark the shadow carries almost
nothing, so it goes deeper and the hairline does correspondingly more.

**Radii — two tokens, no others.** `0.375rem` for buttons, inputs and badges;
`0.625rem` for panels. Not generous, not pill-shaped. Radii previously drifted
across screens and were unified deliberately.

**Buttons.** Flat fills, no outer glow, no gradient. Primary is the brass
accent. Secondary is an outline on the card plane. 1px translate on `:active`
for tactile feedback. **A disabled button always states its reason inline** —
"4 extractions need review" — never a silent grey.

**Cards.** Used where elevation communicates hierarchy. At density 8, prefer a
`border-top` divider or negative space over a card; the run dashboard's tier
breakdown and parameters panel are lists in one card, not six cards.

**Tables.** Real `<table>` semantics with scoped headers, never styled divs.
Compact ~36px rows, sticky headers, sortable columns. This is the primary
content type of the app surface — it should look considered, not like a
fallback.

**Money.** Right-aligned, tabular, two decimals, `₹` prefix, thousands
separators. **Negatives are parenthesised — `(₹412.00)` — never a minus sign.**
This is the accounting convention and the audience reads it as one.

**Severity badges.** Colour **plus** a text label **plus** a shape: filled dot
for high, half dot for medium, hollow dot for low. Colour never carries meaning
alone. This also makes the print report correct, where colour is dropped.

**Confidence.** A bar **and** a number, both. The bar to scan, the number to
judge. Values below 0.85 are additionally outlined and labelled.

**Inputs.** Label above, helper text optional, error below. Fields sit on the
**sunk** plane so they read as slots rather than outlines. Focus ring is a 2px
ink outline at 2px offset, everywhere, no exceptions.

**Loading.** Route-level skeletons shaped like the content they replace, so the
layout does not shift when data arrives. No circular spinners. The skeleton is
`aria-hidden` and a visually-hidden status message carries the announcement —
decorative bars read as noise to a screen reader.

**Empty states.** Name what will appear here and give the one action that fills
it. Never a bare "No data". **An empty exception queue is a genuine success
state** — say so warmly; do not render an empty table.

**Errors.** What failed, whether data was affected, what to do next. Extraction
errors always state *"your ledger was not modified."*

**Print.** The reconciliation summary prints from separate static markup, not
from the live DOM — the queue's expanded state is React state, so printing the
screen would produce a report containing whichever findings happened to be open,
and a report that silently omits findings is worse than none. Print forces the
light palette to plain black on white regardless of the viewer's theme, drops
every shadow, and hides the paper grain. Severity survives the loss of colour
**because** §4 requires a text label beside it, which is the reason that rule
exists rather than a happy accident.

**Ledger ornament.** Two conventions available and worth using: `.rule-subtotal`
is a single top rule marking a figure as the sum of what precedes it;
`.rule-closing` is a 3px double rule marking a closing figure. The public hero
uses ruled paper at a 2rem rhythm with an oxblood margin rule. **The ruling
rhythm and the entry height must be the same 2rem** — drawn independently they
read as lines behind text rather than as a ledger.

---

## 5. Layout Principles

CSS Grid first. Never `calc()` percentage math. Max-width containment, centred.
Every element occupies its own spatial zone — no absolutely-positioned content
stacking, no text over images, no overlap.

Full-height sections use `min-h-[100dvh]`, never `h-screen`.

**Public pages (variance 7):** left-aligned or asymmetric. Centred hero
compositions are banned. The hero is a ledger ground carrying specimen entries,
with the headline set left.

**The three-equal-card feature row is banned.** The public overview's three
pipeline stages must be an asymmetric split giving **Reconcile** dominant width
— it is already the one card rendered on the ink plane, and the absence of a
model in the matching engine is the claim the whole page exists to make. Equal
thirds flatten the argument into a feature list.

> Note: `docs/DESIGN.md` §7.1.4 considered replacing these cards with an SVG
> diagram and rejected it, because the copy cut had already solved the problem
> it would address. An asymmetric card split is a different change and does not
> reopen that decision.

**App surface (variance 3):** a persistent left sidebar — Overview,
Reconciliations, Exceptions, Settings — with a predictable single content
column. Symmetric grids for summary cards. No compositional surprises.

**The match rate is the single largest element on the run dashboard.** It is the
first number both a controller and a reviewer look for. Set it under a
`.rule-closing` double rule: it is literally the closing figure of the
reconciliation.

### Responsive

- Single column below 768px, no exceptions. Verified free of horizontal page
  overflow at 320, 360, 390, 414, 768, 1024, 1280 and 1440px.
- **Horizontal page overflow is a critical failure**, not a cosmetic one.
- Tables whose columns mean something only next to each other — precision and
  recall, the exception evidence comparison — scroll inside their own
  `TableScroller` container. Where rows are independent records, as in the
  dataset list, each row restates as a card below `md`.
- Headlines scale with `clamp()`. Body text never below 14px.
- 44px minimum tap target on every interactive element.
- Desktop density is unchanged by any of this; the reflow only engages below
  `md`. Nobody clears an exception queue on a phone, but checking a match rate
  on the way to a meeting is ordinary.

---

## 6. Motion & Interaction

**Split by surface, deliberately.**

**Public pages — motion 6.** Spring physics, `stiffness: 100, damping: 20`.
Staggered cascade reveals on lists and stage cards. Perpetual micro-loops are
permitted on decorative marks. Animate `transform` and `opacity` only; never
`top`, `left`, `width` or `height`. Grain and noise on fixed pseudo-elements
only.

**App surface — motion 2.** 150ms `cubic-bezier(0.2, 0, 0, 1)` on hover and
focus. 1px press translation. **Nothing animates on load. Nothing defers
content. No cascade reveals on a table.** Motion must never make a user wait to
read a number, and a staggered reveal on an exception queue does exactly that.

The one legitimate perpetual loop behind sign-in is a reconciliation in
progress, because there the motion *is* the information.

`prefers-reduced-motion` drops every duration to near-zero, on both surfaces.

**Theme.** Three states: `system` (default, follows the OS), `light`, `dark`. A
two-state toggle is wrong — once clicked it can never return to following the
OS. Store the *preference*, never the resolved theme. Resolve to a `data-theme`
attribute on `<html>` in a `<head>` script before first paint; resolving in an
effect paints light then repaints, which is what makes a dark mode feel broken.

---

## 7. Anti-Patterns (Banned)

**Generic AI tells**

- No emojis, anywhere.
- No pure black `#000000`.
- No neon or outer-glow shadows. No gradient text on headers.
- No custom mouse cursors.
- No oversaturated accents. Nothing above 80% saturation.
- No purple or neon-blue "AI" register. There is no blue anywhere in this
  palette, deliberately.
- No overlapping elements. No text over images.
- No three-column equal card rows.
- No centred hero sections on public pages.
- No filler UI text: "Scroll to explore", "Swipe down", bouncing chevrons,
  scroll arrows.
- No generic placeholder names — no "John Doe", "Acme", "Nexus". Use realistic
  references in the project's own shape: `ORD-4471`, `TXN-88210`.
- No fake round numbers. **Every figure on a public surface is computed by the
  engine at render, never typed.** The landing page and `/evaluation` run the
  same deterministic engine, so they cannot disagree. A marketing figure that
  has drifted from the measured one is precisely the failure this product exists
  to argue against.
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen",
  "Powered by AI".
- No broken image links. This product has no photography at all — use the
  ledger ornament and inline SVG.

**This project's own bans**

- **No em dashes in user-facing copy.** All five public pages render zero. Short
  declaratives instead of subordinating dashes. (They remain in code comments,
  which no user reads.)
- **No pie charts.** The exception breakdown is a ranking, so it is a horizontal
  bar chart: lengths compare better than angles at every size that matters, and
  the type names stay legible without a legend.
- **Nothing plotted that is not measured.** No synthetic time axis. A dataset
  run once shows one point and says so, rather than inventing thirty days of
  history.
- **No third-party logo wall.** There are no live API integrations — Stripe,
  Razorpay, PayPal and bank marks would claim a capability and a relationship
  that do not exist, to an audience specifically judging what is real.
  `/formats` answers the same question honestly with a column list.
- **No onboarding tour.** No testimonials. No feature grid. No CTA beyond the
  two the landing page carries.
- **No decorative number that could be mistaken for a measured one.** The hero's
  specimen ledger entries are `aria-hidden` and carry no label that could read
  as a claim, because four genuinely measured figures sit a few hundred pixels
  below them.
- **No AI shown as a verdict.** The Explain panel renders its function-call
  trace *above* the answer, never behind a disclosure. It is the evidence that
  the answer came from data rather than from the model's imagination. A refusal
  renders as a calm normal answer, not an error.
- **Never render a guess as a fact.** Low-confidence extractions must look
  different from confirmed ones. A blocked record must look blocked.

---

## 8. Deliberate overrides of the generic taste baseline

Recorded so a later reader sees decisions rather than oversights.

| Baseline rule | This system | Reason |
|---|---|---|
| `Inter` banned | Kept | It carries the true tabular figures the money columns depend on, and `--font-mono` resolves to it. The alignment is a correctness property, not a preference. |
| Garamond-class serif banned; serif banned in dashboards | Kept, tightly scoped | Cormorant is confined to `h1` and `.display`. It never reaches a dashboard table. |
| Neutral Zinc/Slate base | Warm parchment and brass | The recorded identity, and measured compliant on every other colour constraint: no pure black, one accent, saturation 10–48%. |
| Max one accent | One accent plus four signal colours | Severity is a functional requirement of the exception queue. Collapsing it destroys the high/low split that keeps the queue from being noise. All eight pairs measured AA. |
| Perpetual micro-loops everywhere | Public pages only | Motion must never gate reading a figure. One loop behind sign-in: reconciliation in progress. |

---

## 9. Screen inventory

Twelve pages. Four public, one auth boundary, seven behind sign-in.

| Route | Screen | Register |
|---|---|---|
| `/` | Public overview — the pipeline argument, measured figures, two exits | public |
| `/evaluation` | Accuracy vs ground truth, plus Known Limitations **on the page** | public |
| `/docs` | How matching works: four tiers, the frozen taxonomy | public |
| `/formats` | The exact columns each adapter accepts | public |
| `/signin` | Google OAuth primary, email/password secondary | boundary |
| `/datasets` | Dataset list and creation, each row showing its latest run | app |
| `/datasets/[id]` | Two symmetric upload panels; run button blocked while review is pending | app |
| `/datasets/[id]/review` | **The human gate** — document beside extracted fields | app |
| `/datasets/[id]/runs/[runId]` | Run dashboard, three charts, exception queue, Ask panel, print report | app |
| `/reconciliations` | Every run across datasets | app |
| `/exceptions` | Every finding across runs; read-only by design | app |
| `/settings` | Account, published thresholds (not editable), retention statement | app |

**The exception queue is the product.** Everything else is navigation to it. A
row expands to show both sides with the differing line marked — the comparison
*is* the explanation. Sorted by severity, then amount.

**The extraction review screen is where the product's central claim becomes
visible.** Document and fields side by side, because verification requires
seeing both without switching context. Flagged fields editable in place. The
blocking message states the consequence in plain language, not a status code.

### The frozen exception vocabulary

Eight members. Do not add, rename, or abbreviate — the same strings appear in
the engine, the Postgres enum, the queue UI and the agent's function results.

| Type | Severity | Disposition |
|---|---|---|
| `UNMATCHED_SOURCE` | high | blocking |
| `UNMATCHED_LEDGER` | high | blocking |
| `AMOUNT_MISMATCH` | high | blocking |
| `FEE_VARIANCE` | high | advisory |
| `DUPLICATE_SUSPECTED` | medium | blocking |
| `LOW_CONFIDENCE_EXTRACTION` | medium | advisory |
| `TIMING_DIFFERENCE` | low | advisory |
| `PARTIAL_PAYMENT` | low | advisory |

**Severity means something precise.** High: money unaccounted for. Medium: needs
a human decision. Low: *explained* — the money is accounted for, it simply moved
on a different day or in several pieces. Blocking leaves records unmatched;
advisory annotates a match that was still made. A payout that arrived two days
late is reconciled *and* flagged.

---

## 10. Copy tone

Declarative and short. The landing page is 178 rendered words.

The headline is the motto — *"Every discrepancy, and why."* — followed by one
line: *"Reconciliation you can audit line by line. No model anywhere near the
matching."* Figures come before argument, on the principle that a reviewer who
reads nothing else should still leave with the one number that cannot be faked.

An exception's stated reason is a sentence, never a code and never a template
with its slots showing: *"The processor netted a ₹412.00 refund out of this
payout that the ledger never recorded."*
