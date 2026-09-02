-- ---------------------------------------------------------------------------
-- exception_status — where a finding sits in a reviewer's workflow
--
-- Added 3 September 2026. Until now an exception had a severity (how bad) but
-- no state (what has been done about it), so a reviewer working a queue of
-- fourteen had nowhere to record that they had dealt with nine of them.
--
-- Severity and status are independent axes and must stay that way: severity is
-- the engine's assessment and is derived deterministically from the exception
-- type, while status is a human's and is the only field in the run's output a
-- person is allowed to change. Overloading one onto the other would make the
-- engine's output non-reproducible.
--
-- Runs stay append-only. This does not violate that: the run's counts, match
-- rate and params are still immutable, and re-running produces the same
-- findings. Status is an annotation on top of a frozen result.
--
-- @see docs/DATA_MODEL.md §3.4 — the frozen taxonomy this does NOT extend
-- ---------------------------------------------------------------------------

create type exception_status as enum ('flagged', 'reviewing', 'resolved');

alter table public.exceptions
  add column status exception_status not null default 'flagged';

comment on column public.exceptions.status is
  'Reviewer workflow state. Independent of severity, which is the engine''s and is never edited.';

-- The queue filters and sorts on status, and every query is already scoped to
-- one run by RLS plus the recon_run_id predicate.
create index exceptions_run_status_idx
  on public.exceptions (recon_run_id, status);

-- No new policy: exceptions_owner_all is `for all` with both `using` and
-- `with check`, so UPDATE is already scoped to the owning user. Verified by
-- attempting an anonymous update, which must fail with 42501.
