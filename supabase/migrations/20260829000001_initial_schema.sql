-- ============================================================================
-- AI Finance Controller — initial schema
--
-- Implements docs/DATA_MODEL.md. Three conventions govern everything below and
-- are worth reading before changing anything:
--
--   1. Money is `bigint` minor units (paise). Never numeric, never float. A
--      rounding drift in a reconciliation tool is a wrong answer that looks
--      right.
--   2. Transaction dates are `date`, not `timestamptz`. They are calendar
--      facts; storing them as instants invites timezone shifts that manufacture
--      phantom timing exceptions.
--   3. Every user-scoped table carries `user_id` and RLS with BOTH `using` and
--      `with check`. Without `with check`, a user can read only their own rows
--      but insert rows attributed to someone else.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enumerations — the closed vocabularies shared with src/core/taxonomy.ts.
-- Changing one of these means changing the TypeScript union, the UI, and the
-- agent's function results in the same commit.
-- ---------------------------------------------------------------------------

-- Named `dataset_domain` rather than `domain` to avoid colliding with the SQL
-- CREATE DOMAIN concept.
create type dataset_domain as enum ('settlement', 'bank');

create type record_side as enum ('source', 'ledger');

-- Ordered strongest evidence first; the tier that claimed a match is persisted
-- so the Q&A agent can explain how two records were paired.
create type match_tier as enum (
  'EXACT_REF',
  'EXACT_AMOUNT_DATE',
  'FUZZY_REF',
  'PARTIAL_SET'
);

create type exception_type as enum (
  'UNMATCHED_SOURCE',
  'UNMATCHED_LEDGER',
  'AMOUNT_MISMATCH',
  'TIMING_DIFFERENCE',
  'DUPLICATE_SUSPECTED',
  'PARTIAL_PAYMENT',
  'FEE_VARIANCE',
  'LOW_CONFIDENCE_EXTRACTION'
);

create type exception_severity as enum ('high', 'medium', 'low');

create type extraction_status as enum (
  'pending',
  'needs_review',
  'confirmed',
  'rejected',
  'failed'
);

-- ---------------------------------------------------------------------------
-- datasets — one reconciliation context: a domain, two sides, and a run history
-- ---------------------------------------------------------------------------
create table public.datasets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  domain     dataset_domain not null,
  -- Single currency per dataset by design; cross-currency matching needs
  -- FX-rate-at-date and is out of scope (docs/PRD.md §6).
  currency   char(3) not null default 'INR',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- documents — uploaded files awaiting or having undergone extraction
-- ---------------------------------------------------------------------------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  dataset_id   uuid not null references public.datasets (id) on delete cascade,
  side         record_side not null,
  storage_path text not null,
  mime_type    text not null,
  byte_size    integer not null check (byte_size > 0),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- extractions — what the model read out of a document, pending or promoted
-- ---------------------------------------------------------------------------
create table public.extractions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  document_id    uuid not null references public.documents (id) on delete cascade,
  status         extraction_status not null default 'pending',
  -- Shape: { field: { value, confidence } }
  fields         jsonb not null default '{}'::jsonb,
  -- Denormalised lowest field confidence, so the review queue can filter
  -- without unpacking the jsonb on every row.
  min_confidence real check (min_confidence >= 0 and min_confidence <= 1),
  -- Which model produced this. Required for reproducibility: when extraction
  -- quality shifts because a provider rotated a model, the only way to know is
  -- to have recorded it.
  model_id       text,
  error          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- source_records / ledger_entries — the two sides, in normalized form
--
-- Identical shape, kept as separate tables for query clarity and simpler RLS.
-- ---------------------------------------------------------------------------
create table public.source_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  dataset_id     uuid not null references public.datasets (id) on delete cascade,
  external_ref   text not null,
  -- Uppercased, punctuation stripped. This, not external_ref, is the match key.
  normalized_ref text not null,
  txn_date       date not null,
  -- Signed integer paise. Adapters fold debit/credit direction into the sign,
  -- so the engine never reasons about direction.
  amount_minor   bigint not null,
  description    text not null default '',
  -- Domain-specific payload the engine ignores: fee breakdown for settlement,
  -- narration and direction for bank.
  detail         jsonb not null default '{}'::jsonb,
  origin         text not null default 'csv' check (origin in ('csv', 'extraction')),
  extraction_id  uuid references public.extractions (id) on delete set null,
  created_at     timestamptz not null default now()
);

create table public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  dataset_id     uuid not null references public.datasets (id) on delete cascade,
  external_ref   text not null,
  normalized_ref text not null,
  txn_date       date not null,
  amount_minor   bigint not null,
  description    text not null default '',
  detail         jsonb not null default '{}'::jsonb,
  origin         text not null default 'csv' check (origin in ('csv', 'extraction')),
  extraction_id  uuid references public.extractions (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recon_runs — one execution of the engine. Append-only: re-running creates a
-- new row rather than mutating the last, so results stay reproducible.
-- ---------------------------------------------------------------------------
create table public.recon_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  dataset_id      uuid not null references public.datasets (id) on delete cascade,
  -- Thresholds are SNAPSHOTTED, not referenced. A run must remain explicable
  -- months later, after someone has retuned the defaults.
  params          jsonb not null,
  source_count    integer not null default 0,
  ledger_count    integer not null default 0,
  matched_count   integer not null default 0,
  exception_count integer not null default 0,
  match_rate      real not null default 0 check (match_rate >= 0 and match_rate <= 1),
  duration_ms     integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- matches — pairings the engine established
--
-- Both sides are arrays to accommodate PARTIAL_SET, where several source
-- records together satisfy one ledger entry.
-- ---------------------------------------------------------------------------
create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  recon_run_id       uuid not null references public.recon_runs (id) on delete cascade,
  source_record_ids  uuid[] not null default '{}',
  ledger_entry_ids   uuid[] not null default '{}',
  tier               match_tier not null,
  amount_delta_minor bigint not null default 0,
  day_delta          integer not null default 0,
  rationale          text not null default ''
);

-- ---------------------------------------------------------------------------
-- exceptions — discrepancies the engine could not resolve, or anomalies it found
-- ---------------------------------------------------------------------------
create table public.exceptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  recon_run_id      uuid not null references public.recon_runs (id) on delete cascade,
  type              exception_type not null,
  severity          exception_severity not null,
  source_record_ids uuid[] not null default '{}',
  ledger_entry_ids  uuid[] not null default '{}',
  -- Plain English, read directly by a finance user. Never an error code.
  stated_reason     text not null,
  -- The figures behind stated_reason. Exists so the Q&A agent can QUOTE numbers
  -- rather than re-derive them: an agent that reports is trustworthy, one that
  -- computes is not.
  evidence          jsonb not null default '[]'::jsonb,
  suggested_action  text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
--
-- The three matching access paths, plus user_id on every table because RLS
-- filters on it for every query.
-- ---------------------------------------------------------------------------
create index datasets_user_idx          on public.datasets (user_id);
create index documents_user_idx         on public.documents (user_id);
create index documents_dataset_idx      on public.documents (dataset_id);
create index extractions_user_idx       on public.extractions (user_id);
create index extractions_document_idx   on public.extractions (document_id);
create index extractions_status_idx     on public.extractions (status);

create index source_records_user_idx    on public.source_records (user_id);
create index source_records_ref_idx     on public.source_records (dataset_id, normalized_ref);
create index source_records_amount_idx  on public.source_records (dataset_id, amount_minor);
create index source_records_date_idx    on public.source_records (dataset_id, txn_date);

create index ledger_entries_user_idx    on public.ledger_entries (user_id);
create index ledger_entries_ref_idx     on public.ledger_entries (dataset_id, normalized_ref);
create index ledger_entries_amount_idx  on public.ledger_entries (dataset_id, amount_minor);
create index ledger_entries_date_idx    on public.ledger_entries (dataset_id, txn_date);

create index recon_runs_user_idx        on public.recon_runs (user_id);
create index recon_runs_dataset_idx     on public.recon_runs (dataset_id, created_at desc);
create index matches_user_idx           on public.matches (user_id);
create index matches_run_idx            on public.matches (recon_run_id);
create index exceptions_user_idx        on public.exceptions (user_id);
create index exceptions_run_idx         on public.exceptions (recon_run_id);
create index exceptions_type_idx        on public.exceptions (recon_run_id, type);

-- ---------------------------------------------------------------------------
-- Row-Level Security
--
-- This is the actual security control. Google sign-in gates the interface; the
-- anon key ships to the browser and is only safe because these policies hold.
--
-- `auth.uid()` is wrapped in a scalar subquery so Postgres evaluates it once
-- per statement rather than once per row.
-- ---------------------------------------------------------------------------
alter table public.datasets       enable row level security;
alter table public.documents      enable row level security;
alter table public.extractions    enable row level security;
alter table public.source_records enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.recon_runs     enable row level security;
alter table public.matches        enable row level security;
alter table public.exceptions     enable row level security;

create policy datasets_owner_all on public.datasets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy documents_owner_all on public.documents
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy extractions_owner_all on public.extractions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy source_records_owner_all on public.source_records
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy ledger_entries_owner_all on public.ledger_entries
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy recon_runs_owner_all on public.recon_runs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy matches_owner_all on public.matches
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy exceptions_owner_all on public.exceptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Storage — uploaded documents, private, one folder per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Objects are stored at `{user_id}/{filename}`, and the policy keys on that
-- leading folder. Same reasoning as the table policies: the bucket being
-- private is not enough on its own.
create policy documents_storage_owner_all on storage.objects
  for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
