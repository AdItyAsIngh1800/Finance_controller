# Demo CSVs

Hand-authored settlement/ledger pairs for demoing the reconciliation run screen
directly (domain: **SETTLEMENT**, currency: **INR**). Drop `processor.csv` into
"What the processor says" and `books.csv` into "What your books say".

Each pair isolates one behavior so it can be narrated on its own. Verified by
running every pair through `reconcile()` directly — see git history of this
file's introducing commit for the check script; expected output is quoted
below each scenario.

Not covered here: `LOW_CONFIDENCE_EXTRACTION`. That exception only comes from
the Stage 1 PDF/scan extraction path, which a direct CSV upload skips entirely.

## 01-clean-match
5 orders, references and amounts agree exactly on both sides.
Expect: 5/5 matched, all `EXACT_REF`, **zero exceptions**.

## 02-timing-and-fuzzy-ref
- `ORD-7790`: same ref and amount, but settled 10 days after the ledger date
  (window is ±3 days) → matches, then flagged `TIMING_DIFFERENCE` (low).
- `ORD-7788` / `ORD-7789`: a one-character reference typo plus a ₹5 rounding
  gap, both within tolerance → no exact key on either side, caught by the
  `FUZZY_REF` tier instead.

Expect: 2/2 matched (1 `EXACT_REF`, 1 `FUZZY_REF`), 1 `TIMING_DIFFERENCE`.

## 03-amount-mismatch
Same reference on both sides, but the amount differs by more than tolerance
for a specific, explainable reason — the residue step pairs these up even
though no tier claimed them:
- `ORD-6001`: gap equals an unrecorded refund.
- `ORD-6002`: gap equals an unrecorded chargeback.
- `ORD-6003`: gap equals an unrecorded fee.
- `ORD-6004`: gap doesn't match any single component (generic message).

Expect: 0 matches, 4 `AMOUNT_MISMATCH` (high).

## 04-partial-payment
Two ledger invoices, each settled as several smaller instalments
(`ORD-5000-1/2`, `ORD-5010-1/2/3`) that sum exactly to the invoice.

Expect: 5/5 matched via `PARTIAL_SET`, 2 `PARTIAL_PAYMENT` (low, advisory).

## 05-duplicate-suspected
- `ORD-4001`: one processor row, but booked twice in the ledger by mistake
  (source-side ambiguity).
- `ORD-4002`: one ledger row, but the processor shows it twice (ledger-side
  ambiguity).

Expect: 0 matches, 2 `DUPLICATE_SUSPECTED` (medium) — all 6 records blocked,
none guessed at.

## 06-fee-variance
Both orders match cleanly on reference and stated amount, but the processor's
own arithmetic doesn't foot: `gross - fees - refunds - chargebacks ≠ net`.

Expect: 2/2 matched (`EXACT_REF`), 2 `FEE_VARIANCE` (high, but advisory — the
match still stands, the arithmetic is just flagged).

## 07-unmatched
Two processor payouts with no ledger counterpart, two ledger entries the
processor never confirmed. No shared references or amounts.

Expect: 0 matches, 2 `UNMATCHED_SOURCE` + 2 `UNMATCHED_LEDGER` (high).

## 08-full-mix
One combined run exercising all four match tiers and every exception type
above at once (13 records per side) — the one to reach for when you want a
single realistic-looking run rather than a narrated sequence.

Expect: 8/13 matched (spanning `EXACT_REF`, `EXACT_AMOUNT_DATE`, `FUZZY_REF`,
`PARTIAL_SET`), 10 exceptions covering all 7 CSV-reachable types.

## 09-hostile-input
`processor.csv` mixes two valid rows with six broken ones: empty reference,
an invalid calendar date, a non-ISO date format, a non-numeric amount, an
amount with three decimal places, and a blank required amount. One row
(`H-008`) uses a currency symbol and thousands separator on purpose — that one
is *not* an error, to show the parser tolerates it.

Expect: the upload is **rejected outright** with six named row+column errors,
even though two rows in the same file are perfectly valid — a ledger missing
rows reconciles into spurious noise, so the whole file is refused rather than
silently dropping the bad rows.

## 10-bank-full-mix
The bank-domain counterpart to `08-full-mix` (domain: **BANK**). Drop
`statement.csv` into "What the source says" and `ledger.csv` into "What your
books say". 11 records per side, exercising all four match tiers and every
exception type the bank domain can produce in one run (`FEE_VARIANCE` is
structurally impossible here — bank records carry no gross/fees/net
breakdown to check).

Expect: 7/11 matched (2 `EXACT_REF` clean, 1 `EXACT_REF` flagged
`TIMING_DIFFERENCE`, 1 `EXACT_AMOUNT_DATE`, 1 `FUZZY_REF`, 1 `PARTIAL_SET` of
2 instalments), 7 exceptions: 1 `TIMING_DIFFERENCE` (low), 1
`PARTIAL_PAYMENT` (low, advisory), 1 `DUPLICATE_SUSPECTED` (medium, ledger
booked the same UTR twice), 2 `AMOUNT_MISMATCH` (high, generic message — no
fee breakdown to attribute the gap to), 1 `UNMATCHED_SOURCE` + 1
`UNMATCHED_LEDGER` (high). Verified by running both files through
`reconcile()` directly.
