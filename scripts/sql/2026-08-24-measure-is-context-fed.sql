-- Add is_context_fed to measure_definitions: TRUE for the "Country Context" measures
-- (subgroup 221) whose data is fed from the country_context table via the read bridge,
-- NOT entered per-utility. An absolute shell-exclusion gate — these measures never get
-- data-entry relevance or generated shells. Distinct from is_system_generated (computed).
-- Per Eugene's disposition ruling (2026-08-24): the 16 subgroup-221 definitions survive
-- as catalogue identity (KPI formula_inputs bind 6 of them), retired from data entry.
-- Applied to dev 2026-08-24. Run per environment. Idempotent.

ALTER TABLE measure_definitions
  ADD COLUMN IF NOT EXISTS is_context_fed boolean NOT NULL DEFAULT false;

-- flag the Country Context measures (subgroup 221)
UPDATE measure_definitions
  SET is_context_fed = true
  WHERE measures_subgroup_id = 221
    AND is_context_fed = false;
