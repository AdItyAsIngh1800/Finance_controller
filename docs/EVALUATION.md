# Evaluation — AI Finance Controller

**Last updated:** 29 August 2026
**Status:** Methodology defined; measured results populated at Phase 3 and Phase 9.

> *"How do you know it's right?"* is the question most hackathon projects cannot answer. This document is the answer, and the in-app `/evaluation` page renders it live.

---

## 1. Why This Document Exists

A reconciliation tool that reports a 94% match rate has said nothing until you know what the other 6% is and whether the 94% is correct. A tool can achieve 100% match rate by matching everything to anything.

So the claim under test is not *"the system produces output."* It is:

1. **Does it find the discrepancies that are actually there?** (recall)
2. **Are the things it flags genuinely discrepancies?** (precision)
3. **Does it ever match two records that do not belong together?** (false-match rate — the one that matters most)
4. **Does the extraction layer know when it is unsure?** (confidence calibration)
5. **Does the agent ever state a number that is not in the data?** (grounding)

---

## 2. Ground-Truth Methodology

**The core idea:** the synthetic data generator *plants* discrepancies deliberately and records exactly what it planted. Because the correct answer is known before the engine runs, output can be scored rather than eyeballed.

### 2.1 Generation procedure

1. Generate N clean, correctly-corresponding source/ledger pairs.
2. Inject a controlled count of each exception type by mutating specific pairs:

| Planted | Mutation |
|---|---|
| `UNMATCHED_SOURCE` | Delete the ledger counterpart |
| `UNMATCHED_LEDGER` | Delete the source counterpart |
| `AMOUNT_MISMATCH` | Alter the source amount beyond tolerance |
| `TIMING_DIFFERENCE` | Shift the source date beyond the window |
| `DUPLICATE_SUSPECTED` | Clone a source record with a near-identical reference |
| `PARTIAL_PAYMENT` | Split one source record into three summing to the ledger entry |
| `FEE_VARIANCE` | Break the `net = gross − fees − refunds − chargebacks` identity |

3. Apply **reference variance** to a further set of pairs. These are *not*
   discrepancies — the records still correspond and their amounts still agree,
   so they remain clean pairs and no exception is expected. They exist to deny
   the engine an exact-reference match and force it onto a weaker tier:

| Variance | Mutation | Tier exercised |
|---|---|---|
| Voucher reference | Ledger files against its own voucher number, sharing no reference with the source | `EXACT_AMOUNT_DATE` |
| Re-keyed entry | Character transcription error (`O` keyed as `0`) plus a ₹0.50 rounding drift, below the tolerance floor | `FUZZY_REF` |

   Both preserve reference uniqueness. A collision would give two ledger entries
   the same reference and manufacture an ambiguity the manifest never planted.

   Without this step the exact-reference tier claims every pair, and two of the
   four matching tiers go entirely unexercised — a gap that produced a fully
   green suite over half-untested matching logic before it was caught.

4. Emit `fixtures/<domain>/{source.csv, ledger.csv, ground-truth.json}`.

`ground-truth.json` records, per planted item: the record IDs involved, the expected `exception_type`, and the expected magnitude. **Every pair not named in the manifest is known-clean** — which is what makes false-match measurement possible at all.

### 2.2 Rendered documents for Stage 1

*Deferred to Phase 6, where the extraction code that consumes these documents is built — the rendering approach depends on what the model actually needs.*

A subset of fixture records will be rendered to PDF/image. Because these derive from generated data, **the correct extraction is known field by field**, allowing extraction accuracy to be measured rather than asserted.

Degraded variants — reduced resolution, skew, noise — are produced from the same records to test **whether low quality produces low confidence**, which is the property the confidence gate depends on.

### 2.3 Honest limits of this methodology

Stated plainly, because the method's weakness matters as much as its results:

- **The generator encodes the same assumptions as the engine.** Both were written by one person in one week. Real data breaks assumptions neither anticipated.
- **Planted discrepancies are cleanly typed.** Real discrepancies are frequently two problems at once — a partial payment that is *also* late *also* recorded under a mistyped reference.
- **Rendered PDFs are cleaner than real scans.** No coffee stains, no phone-camera perspective, no unusual vendor template.
- **Reference variance is narrow.** Two transcription patterns are simulated (a voucher substitution and a single-character typo); real exports vary in far more ways, including truncation, embedded metadata, and inconsistent padding.

**This measures whether the engine implements its own logic correctly. It does not prove the logic survives contact with reality.** Those are different claims and are not conflated anywhere in this project.

---

## 3. Metrics

### 3.1 Match rate *(headline, not a quality measure)*
```
match_rate = matched_records / total_source_records
```
Reported because it is the number a controller looks for first. **It is explicitly not a correctness metric** — a broken engine that matches everything scores 100%. It is contextualised on the dashboard by the tier breakdown and always presented alongside §3.2–3.3.

### 3.2 Per-type precision and recall
```
precision = correctly_flagged / total_flagged        "when it flags, is it right?"
recall    = correctly_flagged / total_planted        "does it find what's there?"
```
Reported **per exception type**, not aggregated. An engine can be excellent at unmatched records and blind to fee variance; an average hides that.

### 3.3 False-match rate — **the metric that matters most**
```
false_match_rate = incorrect_matches / total_matches      target: 0
```
A record pair the manifest says should *not* match, which the engine matched anyway.

**Why this is the primary metric.** A false *exception* costs a human thirty seconds of review. A false *match* silently conceals a real discrepancy — the precise failure this product exists to prevent. The two errors are not symmetric, and the thresholds reflect that: recall may miss 5%, false matches must be zero.

### 3.4 Extraction accuracy and confidence calibration
- **Field accuracy** — extracted value equals known value, per field type.
- **Calibration** — do low-confidence fields actually fail more often than high-confidence ones?

Calibration is the more important of the two. A model at 85% accuracy that reliably *knows which 15% it got wrong* is far more useful here than a 95%-accurate model with flat confidence, because the confidence gate converts self-knowledge into safety.

### 3.5 Grounding compliance
Manual, on a fixed question set:
- Does every monetary figure in an answer appear in a function result? *(must be 100%)*
- Are unanswerable questions declined rather than answered? *(must be 100%)*

Manual by design: the failure being tested for is a model asserting something plausible, which no automated assertion catches reliably in a one-week build.

---

## 4. Acceptance Thresholds

| Metric | Threshold | Requirement | Rationale |
|---|---|---|---|
| Recall (per type) | ≥ 95% | NFR-1.1 | Missing a discrepancy defeats the purpose |
| Precision (per type) | ≥ 90% | — | Some false positives acceptable; humans review them cheaply |
| **False-match rate** | **0** | **NFR-1.2** | **A hidden discrepancy is the failure mode this product exists to prevent** |
| Determinism | byte-identical | NFR-1.4 | Non-reproducible results cannot be signed off |
| Extraction field accuracy | ≥ 90% (clean docs) | — | Gate catches the remainder |
| Confidence calibration | low-conf error rate > high-conf | FR-4.4 | The gate only works if confidence is informative |
| Grounding compliance | 100% | FR-7.5, FR-7.6 | One invented figure invalidates the thesis |

---

## 5. Results

*Engine results below are measured. Extraction (§5.3) and grounding (§5.4) are populated in Phase 9. The `/evaluation` page renders §5.1 live from a real run rather than from these tables.*

*Measured 29 August 2026 via `npm run scorecard`. 250 base pairs per domain.*

### 5.1 Engine — settlement domain
| Exception type | Planted | Reported | Correct | Precision | Recall |
|---|---|---|---|---|---|
| `UNMATCHED_SOURCE` | 3 | 3 | 3 | 1.00 | 1.00 |
| `UNMATCHED_LEDGER` | 2 | 2 | 2 | 1.00 | 1.00 |
| `AMOUNT_MISMATCH` | 2 | 2 | 2 | 1.00 | 1.00 |
| `TIMING_DIFFERENCE` | 5 | 5 | 5 | 1.00 | 1.00 |
| `DUPLICATE_SUSPECTED` | 2 | 2 | 2 | 1.00 | 1.00 |
| `PARTIAL_PAYMENT` | 1 | 1 | 1 | 1.00 | 1.00 |
| `FEE_VARIANCE` | 1 | 1 | 1 | 1.00 | 1.00 |

**Match rate:** 96.4% (243/252) · **False matches: 0** · **Determinism:** byte-identical across runs · **Runtime (1,000 pairs):** <5s

**Matches by tier:** `EXACT_REF` 226 · `EXACT_AMOUNT_DATE` 8 · `FUZZY_REF` 6 · `PARTIAL_SET` 1

### 5.2 Engine — bank domain

*Re-measured 30 August 2026 after the bank adapter landed. Figures below are from the CSV ingestion path, not in-memory records — a test asserts the two agree.*

| Exception type | Planted | Reported | Correct | Precision | Recall |
|---|---|---|---|---|---|
| `UNMATCHED_SOURCE` | 3 | 3 | 3 | 1.00 | 1.00 |
| `UNMATCHED_LEDGER` | 2 | 2 | 2 | 1.00 | 1.00 |
| `AMOUNT_MISMATCH` | 2 | 2 | 2 | 1.00 | 1.00 |
| `TIMING_DIFFERENCE` | 5 | 5 | 5 | 1.00 | 1.00 |
| `DUPLICATE_SUSPECTED` | 2 | 2 | 2 | 1.00 | 1.00 |
| `PARTIAL_PAYMENT` | 1 | 1 | 1 | 1.00 | 1.00 |

**Match rate:** 96.4% (243/252) · **False matches: 0** · `FEE_VARIANCE` correctly never raised.

**Matches by tier:** `EXACT_REF` 226 · `EXACT_AMOUNT_DATE` 8 · `FUZZY_REF` 6 · `PARTIAL_SET` 1

**The adapter claim, tested rather than asserted.** Adding this domain required
**zero changes to engine source** — `engine.ts` and `tiers.ts` were last modified
in Phase 3 and were not touched again. The bank domain's debit/credit convention
is folded into the sign of `amount_minor` at the adapter boundary, so the engine
compares signed integers and has no branch for direction anywhere.

**Reading these figures honestly.** Perfect scores here measure whether the
engine implements its own logic correctly against data generated from the same
assumptions — not whether it survives real settlement files. §2.3 and §6 state
what that does and does not establish. The figure worth weighting is the zero
false matches; the 1.00 recall reflects cleanly-typed planted discrepancies,
which real ones are not.

### 5.3 Extraction

*Measured 29 August 2026 via `npm run extraction:report`, against `gemini-3.6-flash`. Five rendered statements plus one deliberately degraded scan of the same document.*

| Document | Quality | Reference | Date | Net | Min confidence | Outcome |
|---|---|---|---|---|---|---|
| ORD-4471 | clean | ✓ | ✓ | ✓ | 0.98 | confirmed |
| ORD-4401 | clean | ✓ | ✓ | ✓ | 1.00 | confirmed |
| ORD-4402 | clean | ✓ | ✓ | ✓ | 0.99 | confirmed |
| ORD-4403 | clean | ✓ | ✓ | ✓ | 1.00 | confirmed |
| ORD-4404 | clean | ✓ | ✓ | ✓ | 0.98 | confirmed |
| ORD-4471 | **degraded** | ✗ | ✗ | ✗ | **0.40** | **needs_review** |

**Field accuracy:** 100% (15/15) clean · 0% (0/3) degraded
**Mean confidence:** 0.99 clean · 0.40 degraded · **threshold 0.85**
**Degraded-document gate: every degraded document was quarantined.**

**Why the second row matters more than the first.** 100% accuracy on clean
documents is a pleasant result but a weak claim — it says the model can read
legible text. The degraded row is the one that validates the design: the model
got *every* figure wrong **and reported 0.40 confidence**, so the record was
blocked from the ledger rather than entering reconciliation as a set of
plausible-looking wrong numbers.

That is the property the whole of Stage 1 depends on. A model that were 95%
accurate with flat confidence would be *less* useful here than one that is
imperfect and reliably flags its own failures, because only the latter can be
gated. Confidence being informative was an open question until measured; it is
no longer an assumption.

### 5.4 Grounding

*Measured 29 August 2026 via `npm run grounding:report`, against `gemini-3.6-flash`
and a real reconciliation run. Questions are deliberately adversarial: three the
data supports, four it does not — two of which are phrased to bait arithmetic or
a forecast.*

| Question | Expected | Calls made | Outcome |
|---|---|---|---|
| Why was the payout for ORD-4471 short by ₹412? | answer | `findRecords` → `getSettlementBreakdown` → `getExceptionDetail` | Cited the ₹412.00 refund and both net figures |
| What was the match rate, and how many exceptions? | answer | `getReconciliationSummary` | 96.4%, 16 exceptions |
| Which exceptions are the most serious, and why? | answer | `getReconciliationSummary` | Answered from the severity breakdown |
| **What will next month's payout be?** | decline | `getReconciliationSummary` | *"cannot predict or forecast future payouts"* |
| **What is the CEO's salary?** | decline | `findRecords` | *"This data does not show the CEO's salary"* |
| **Add up every exception and give the total at risk.** | decline | `getReconciliationSummary` | *"I am not permitted to perform arithmetic"* |
| **Should we switch payment processors?** | decline | `getReconciliationSummary` | *"does not contain vendor evaluations"* |

**Ungrounded figures: 0 of 0.** Every monetary amount quoted across all seven
answers appears verbatim in a function result. **Agent outages: 0.**

**How this is measured, and why it is not self-marking.** The data source is
wrapped in a recorder that captures everything handed to the model. Each answer
is then scanned for monetary figures, and every one is checked against that
transcript. A figure the model produced but no function returned is caught
regardless of how plausible it reads — which is the only way to catch a failure
whose whole character is that it looks correct.

The refusal count is reported separately and *is* a heuristic over natural
language: an answer can decline perfectly well in wording no pattern anticipated.
It is tracked so a regression is visible, but the headline metric is the
objective one, because tuning a pattern until a suite goes green would make the
suite meaningless.

**Two findings from this run, both fixed:**

- Gemini 3.x attaches a `thoughtSignature` to function-call parts that must be
  echoed back verbatim. Reconstructing the model's turn from name and arguments
  looked equivalent and was not — every answerable question failed with a 400
  until the original content was passed through unchanged.
- `getReconciliationSummary` originally returned exception counts by *type* but
  not by *severity*, so "which exceptions are most serious" was genuinely
  unanswerable and the agent correctly refused it. The gap was in the function
  surface, not the model: severity is the queue's central distinction and the
  agent needs it.

---

## 6. Known Limitations

Stated here in full rather than discovered by a judge. This section is also rendered in-product on `/evaluation`.

### Validation
- **Never tested on real data.** All figures come from data the system generated itself. This validates internal logic, not real-world robustness. *The single most important limitation on this list.*
- Planted discrepancies are cleanly typed; real ones compound.
- Rendered PDFs are cleaner than genuine scans.

### Engine
- **Subset-sum bounded to 3 records** — a payment split four or more ways is missed. Deliberate ceiling; upgrade path is a DP knapsack.
- **Single currency per dataset.** Cross-currency needs FX-rate-at-date.
- **Tolerances are global**, not per-counterparty. Real reconciliation often needs vendor-specific rules.
- **No learning from corrections.** A user fixing the same false positive weekly gets no benefit; the engine is stateless by design.

### Extraction
- **Document extraction reads settlement statements only.** A bank statement has
  no gross/fees/net breakdown for the schema to describe, so bank documents are
  refused at upload rather than read with a settlement schema — which would
  produce plausible-looking wrong fields in the one place this system promises
  not to guess. Bank data is ingested as CSV, where the columns are unambiguous.
- **Handwriting is unreliable** and not claimed to work.
- **Unusual layouts degrade quality** — validated against a narrow set of generated templates.
- **Confidence is model-reported**, not independently verified. Calibration is measured, but a confidently wrong extraction remains possible; the gate mitigates, it does not eliminate.
- Multi-page documents are processed as a unit; very long documents may hit token limits.

### Agent
- Answers only about **persisted reconciliation results** — not live data, not the future.
- **Cannot perform arithmetic** the engine did not already do. Deliberate: it is a reporting layer, not a calculator.
- Multi-turn context is bounded to the current session.

### Operational
- In-memory reconciliation, bounded by serverless memory (~10⁵ records).
- Synchronous extraction; large batches risk request timeouts.
- No exception resolution workflow — the queue is read-only.
- **Not a system of record.** No audit guarantees, no immutability, no compliance claim.

---

## 7. What Would Change With More Time

In priority order, judged by what most threatens the accuracy claims above:

1. **Run it on real, anonymised settlement data.** Every limitation in §6 traces back to this one.
2. **Compound discrepancies in the generator** — late *and* partial *and* mistyped, together.
3. **Independent confidence verification** — cross-check extractions against a second pass instead of trusting self-reported confidence.
4. **Per-counterparty tolerance rules**, learned from user corrections.
5. **Automated grounding checks** — assert every figure in an answer against the source rows in CI.
6. **Adversarial fixtures** — deliberately near-identical records designed to induce false matches.
