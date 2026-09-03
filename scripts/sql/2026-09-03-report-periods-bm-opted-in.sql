-- Add report_periods.bm_opted_in — per-period benchmarking opt-in flag.
-- Per docs/per-period-participation-spec.md (§3). Eugene-directed 2026-09-03:
-- benchmarking eligibility = organisations.is_utility; participation is purely this
-- per-period opt-in. Distinct name from the org-level bm_participates (being retired
-- separately, after its live readers move to this flag).
--
-- ADDITIVE column, defaults false (no period is opted-in until the separate backfill
-- PR derives it from real submitted data). Safe to apply promptly after merge — nothing
-- reads bm_opted_in yet. NOTE for downstream: the compute-gate rewire (#3) must wait
-- until the backfill has populated this flag, else an all-false column skips everything.
--
-- git-first: committed + pushed before running against p2.

ALTER TABLE report_periods
  ADD COLUMN IF NOT EXISTS bm_opted_in boolean NOT NULL DEFAULT false;

-- Verify:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'report_periods' AND column_name = 'bm_opted_in';
