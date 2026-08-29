# Data Model — AI Finance Controller

**Last updated:** 29 August 2026
**Status:** Frozen for build. Changes here ripple into the engine, the UI, and the agent — treat amendments as breaking.

---

## 1. Governing Principles

**Money is `bigint` minor units.** Every monetary column is an integer count of paise. There is no `numeric`, no `float`, no `decimal` anywhere in the money path. `₹412.35` is stored as `41235`. Division and percentage tolerances are computed in integer space and rounded explicitly at the point of comparison, never accumulated. A float drift of 0.001 in a reconciliation tool is not a rounding artefact; it is a wrong answer that looks right.

**Dates are `date`, not `timestamptz`, for record dates.** Settlement and ledger dates are calendar facts, not instants. Storing them as timestamps invites timezone shifts that manufacture phantom `TIMING_DIFFERENCE` exceptions. Row audit columns (`created_at`) remain `timestamptz`.

**Domain variance lives in `detail` JSONB, not in extra tables.** Settlement records carry a fee breakdown; bank records carry a narration and a debit/credit flag. Both normalize to the same columns for matching, and keep what is domain-specific in `detail`. This is what allows one engine to serve two domains.

**Every user-scoped table has `user_id` and RLS.** No exceptions — including join tables. A table without a policy is a table readable by anyone holding the anon key.

---

## 2. Entity Overview

```
auth.users (Supabase managed)
    │
    └──< datasets ─────────────────────────────┐
            │                                  │
            ├──< documents ──< extractions     │
            │                                  │
            ├──< source_records ───┐           │
            │                      │           │
            ├──< ledger_entries ───┤           │
            │                      │           │
            └──< recon_runs ───────┼──< matches
                                   │
                                   └──< exceptions
```

- A **dataset** is one reconciliation context: a domain, two sides of records, and a history of runs.
- **documents** are uploaded files; **extractions** are what the model read out of them, pending or promoted.
- **source_records** (external truth) and **ledger_entries** (internal truth) are the two sides. Both use the normalized shape.
- A **recon_run** is one execution of the engine, producing **matches** and **exceptions**.

Runs are immutable and append-only: re-running creates a new `recon_run` rather than mutating the last. This makes results reproducible and lets the evaluation page compare runs.

---

## 3. Enumerations

### 3.1 `domain`
| Value | Meaning |
|---|---|
| `settlement` | Marketplace / processor payouts (primary) |
| `bank` | Bank statement vs general ledger (secondary) |

### 3.2 `record_side`
| Value | Meaning |
|---|---|
| `source` | External record — what the processor or bank says happened |
| `ledger` | Internal record — what the business says should have happened |

### 3.3 `match_tier`
Ordered by descending confidence. The tier that claims a match is persisted, and is what lets the Q&A agent explain *how* a match was made.

| Value | Rule |
|---|---|
| `EXACT_REF` | Normalized reference equal **and** amount equal |
| `EXACT_AMOUNT_DATE` | Amount equal, date within window |
| `FUZZY_REF` | Reference similarity ≥ threshold, amount within tolerance |
| `PARTIAL_SET` | Bounded subset of source records sums to one ledger entry |

### 3.4 `exception_type` — **the frozen taxonomy**

This vocabulary is shared verbatim by the engine, the database, the UI, and the agent's function results. Adding a category means touching all four.

| Value | Meaning | Severity | Domain |
|---|---|---|---|
| `UNMATCHED_SOURCE` | External record with no ledger counterpart | high | both |
| `UNMATCHED_LEDGER` | Ledger entry the external source never confirmed | high | both |
| `AMOUNT_MISMATCH` | Counterpart found, amount differs beyond tolerance | high | both |
| `TIMING_DIFFERENCE` | Counterpart found, date differs beyond window | low | both |
| `DUPLICATE_SUSPECTED` | More than one viable counterpart | medium | both |
| `PARTIAL_PAYMENT` | Ledger amount satisfied by several smaller source records | low | both |
| `FEE_VARIANCE` | `net ≠ gross − fees − refunds − chargebacks` | high | settlement |
| `LOW_CONFIDENCE_EXTRACTION` | Model confidence below threshold; quarantined before the ledger | medium | both |

**Blocking vs advisory.** An exception either leaves its records unmatched
(`blocking`) or annotates a match that was still made (`advisory`). This follows
from the severity semantics rather than being an independent choice: a payout
flagged `low` because "the money is accounted for" is only coherent if the
records actually paired up. `TIMING_DIFFERENCE`, `PARTIAL_PAYMENT`,
`FEE_VARIANCE`, and `LOW_CONFIDENCE_EXTRACTION` are advisory and still count
toward the match rate; the other four are blocking and do not. The mapping is
`EXCEPTION_DISPOSITION` in `src/core/taxonomy.ts`.

**On severity.** `TIMING_DIFFERENCE` and `PARTIAL_PAYMENT` are `low` because they are *explained* discrepancies — the money is accounted for, it simply moved on a different day or in several pieces. `UNMATCHED_*`, `AMOUNT_MISMATCH`, and `FEE_VARIANCE` are `high` because money is unaccounted for. Severity drives queue ordering, so this distinction is what makes the queue useful rather than merely long.

### 3.5 `extraction_status`
| Value | Meaning |
|---|---|
| `pending` | Extracted, not yet reviewed |
| `needs_review` | At least one field below confidence threshold — **blocked from the ledger** |
| `confirmed` | Human approved; promoted to a record |
| `rejected` | Human discarded |
| `failed` | Extraction errored; nothing written |

---

## 4. Schema

### 4.1 `datasets`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `user_id` | `uuid` FK → `auth.users` | RLS key |
| `name` | `text` | User-supplied |
| `domain` | `domain` | Immutable after creation |
| `currency` | `char(3)` | Default `INR`; single currency per dataset by design |
| `created_at` | `timestamptz` | |

### 4.2 `documents`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | RLS key |
| `dataset_id` | `uuid` FK → `datasets` | `on delete cascade` |
| `side` | `record_side` | Which side this document feeds |
| `storage_path` | `text` | Supabase Storage object path |
| `mime_type` | `text` | Validated on upload |
| `byte_size` | `integer` | Validated on upload |
| `created_at` | `timestamptz` | |

### 4.3 `extractions`
One row per document per extraction attempt. `fields` holds the model's structured output **with per-field confidence**; `min_confidence` is denormalized for cheap threshold filtering.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | RLS key |
| `document_id` | `uuid` FK → `documents` | |
| `status` | `extraction_status` | |
| `fields` | `jsonb` | `{ field: { value, confidence } }` |
| `min_confidence` | `real` | Lowest field confidence in the row |
| `model_id` | `text` | Which model produced this — required for reproducibility |
| `error` | `text` null | Populated when `status = failed` |
| `created_at` | `timestamptz` | |

> `model_id` is stored deliberately. When extraction quality shifts because a provider rotated a model, the only way to know is to have recorded which model produced each row.

### 4.4 `source_records` and `ledger_entries`
Identical shape; separate tables for query clarity and simpler RLS.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | RLS key |
| `dataset_id` | `uuid` FK → `datasets` | |
| `external_ref` | `text` | Raw reference as supplied |
| `normalized_ref` | `text` | Uppercased, punctuation-stripped — matching key |
| `txn_date` | `date` | Calendar date, not timestamp |
| `amount_minor` | `bigint` | Signed integer paise |
| `description` | `text` | |
| `detail` | `jsonb` | Domain-specific payload (see §5) |
| `origin` | `text` | `csv` \| `extraction` — provenance |
| `extraction_id` | `uuid` null FK | Set when promoted from a review |
| `created_at` | `timestamptz` | |

Indexes: `(dataset_id, normalized_ref)`, `(dataset_id, amount_minor)`, `(dataset_id, txn_date)` — the three matching access paths.

### 4.5 `recon_runs`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | RLS key |
| `dataset_id` | `uuid` FK | |
| `params` | `jsonb` | Snapshot of thresholds used — runs stay reproducible even if config changes |
| `source_count` / `ledger_count` | `integer` | |
| `matched_count` / `exception_count` | `integer` | |
| `match_rate` | `real` | Denormalized headline figure |
| `duration_ms` | `integer` | |
| `created_at` | `timestamptz` | |

> `params` is snapshotted rather than referenced. A run must remain explicable months later, after someone has retuned the tolerances.

### 4.6 `matches`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | RLS key |
| `recon_run_id` | `uuid` FK | |
| `source_record_ids` | `uuid[]` | Array to accommodate `PARTIAL_SET` |
| `ledger_entry_ids` | `uuid[]` | Array for the symmetric case |
| `tier` | `match_tier` | How this match was made |
| `amount_delta_minor` | `bigint` | Signed; `0` for exact |
| `day_delta` | `integer` | Signed day difference |
| `rationale` | `text` | Plain-English, engine-generated |

### 4.7 `exceptions`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | RLS key |
| `recon_run_id` | `uuid` FK | |
| `type` | `exception_type` | From the frozen taxonomy |
| `severity` | `text` | `high` \| `medium` \| `low` |
| `source_record_ids` | `uuid[]` | Possibly empty |
| `ledger_entry_ids` | `uuid[]` | Possibly empty |
| `stated_reason` | `text` | **Plain English, not a code** |
| `evidence` | `jsonb` | Numbers behind the reason — what the agent cites |
| `suggested_action` | `text` null | |
| `created_at` | `timestamptz` | |

> `evidence` exists so the Q&A agent has structured figures to quote rather than re-deriving arithmetic. It is the difference between an agent that reports and an agent that computes — and only the former can be trusted.

---

## 5. The `detail` Payload

### Settlement (`source_records.detail`)
```jsonc
{
  "gross_minor":       125000,
  "fees_minor":          3750,
  "refunds_minor":       8000,
  "chargebacks_minor":      0,
  "net_minor":         113250,   // must equal gross − fees − refunds − chargebacks
  "order_ref":     "ORD-4471",
  "fee_lines": [
    { "label": "Platform commission", "amount_minor": 2500 },
    { "label": "Payment gateway",     "amount_minor": 1250 }
  ]
}
```
`fee_lines` is what turns *"the payout was ₹412 short"* into *"₹250 platform commission plus ₹162 gateway fee"*. Without the itemisation the agent can only restate the gap; with it, the agent can explain it.

### Bank (`source_records.detail`)
```jsonc
{
  "narration":     "NEFT/ACME RETAIL/UTR123456",
  "direction":     "credit",        // credit | debit
  "balance_minor": 4820000,
  "utr":           "UTR123456"
}
```
Sign convention is normalized into `amount_minor` by the adapter (credits positive, debits negative) so the engine never reasons about direction.

---

## 6. Row-Level Security

Every table in §4 carries the same policy shape:

```sql
alter table <table> enable row level security;

create policy "<table>_owner_all" on <table>
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Three notes that matter more than the SQL:

1. **`with check` is not optional.** Without it a user can read only their own rows but *insert* rows attributed to someone else.
2. **`user_id` is denormalized onto every child table** rather than joined up to `datasets`. A policy that traverses a join is slower and easier to get subtly wrong; a redundant column is the cheaper correctness.
3. **The policy is verified by attempting a cross-user read, not by reading the policy.** A policy that looks right and a policy that works are different things — see `REQUIREMENTS.md` FR-1.5.

Storage objects carry an equivalent policy keyed on the object path prefix (`{user_id}/...`).

---

## 7. Deliberate Omissions

| Not modelled | Why |
|---|---|
| Multi-currency per dataset | Cross-currency matching needs FX-rate-at-date; a correctness trap, not a feature gap |
| Soft deletes / audit history | This is analysis, not a system of record (`PRD.md` §6) |
| Exception resolution workflow (assign, comment, close) | Real product need, no grading value in one week |
| Multi-entity / intercompany | Out of scope per PRD |
| Chart-of-accounts hierarchy | Matching is on reference and amount, not account structure |
