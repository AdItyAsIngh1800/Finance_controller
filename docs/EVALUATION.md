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

3. Emit `fixtures/<domain>/{source.csv, ledger.csv, ground-truth.json}`.

`ground-truth.json` records, per planted item: the record IDs involved, the expected `exception_type`, and the expected magnitude. **Every pair not named in the manifest is known-clean** — which is what makes false-match measurement possible at all.

### 2.2 Rendered documents for Stage 1

A subset of fixture records is rendered to PDF/image (HTML → PDF). Because these derive from generated data, **the correct extraction is known field by field**, allowing extraction accuracy to be measured rather than asserted.

Degraded variants — reduced resolution, skew, noise — are produced from the same records to test **whether low quality produces low confidence**, which is the property the confidence gate depends on.

### 2.3 Honest limits of this methodology

Stated plainly, because the method's weakness matters as much as its results:

- **The generator encodes the same assumptions as the engine.** Both were written by one person in one week. Real data breaks assumptions neither anticipated.
- **Planted discrepancies are cleanly typed.** Real discrepancies are frequently two problems at once — a partial payment that is *also* late *also* recorded under a mistyped reference.
- **Rendered PDFs are cleaner than real scans.** No coffee stains, no phone-camera perspective, no unusual vendor template.
- **Reference formats are consistent** in a way real processor exports are not.

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

*Populated at Phase 3 (engine) and Phase 9 (extraction, grounding). The `/evaluation` page renders §5.1 live from a real run rather than from these tables.*

### 5.1 Engine — settlement domain
| Exception type | Planted | Found | Correct | Precision | Recall |
|---|---|---|---|---|---|
| `UNMATCHED_SOURCE` | — | — | — | — | — |
| `UNMATCHED_LEDGER` | — | — | — | — | — |
| `AMOUNT_MISMATCH` | — | — | — | — | — |
| `TIMING_DIFFERENCE` | — | — | — | — | — |
| `DUPLICATE_SUSPECTED` | — | — | — | — | — |
| `PARTIAL_PAYMENT` | — | — | — | — | — |
| `FEE_VARIANCE` | — | — | — | — | — |

**Match rate:** — · **False matches:** — · **Determinism:** — · **Runtime (1,000 pairs):** —

### 5.2 Engine — bank domain
*Same table structure, minus `FEE_VARIANCE` (settlement-only).*

### 5.3 Extraction
| Field | Docs | Correct | Accuracy | Mean confidence |
|---|---|---|---|---|
| Reference | — | — | — | — |
| Date | — | — | — | — |
| Amount | — | — | — | — |

**Calibration:** error rate below 0.85 confidence — · above — · **Degraded-document gate:** —

### 5.4 Grounding
| Question | Grounded? | Figures traceable? |
|---|---|---|
| "Why was the payout for ORD-4471 short by ₹412?" | — | — |
| "Which exceptions are worth the most money?" | — | — |
| "Show me everything unmatched from last week." | — | — |
| **"What will next month's payout be?"** *(must decline)* | — | — |
| **"What is the CEO's salary?"** *(must decline — not in data)* | — | — |

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
