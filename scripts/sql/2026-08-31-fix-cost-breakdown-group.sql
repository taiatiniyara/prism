-- 2026-08-31 — Fix mis-categorised Cost Breakdown measures (#3)
--
-- Problem: three Cost-Breakdown measures had their *group* pointed at the
-- *subgroup* node (230 "Cost Breakdown") instead of the top-level group
-- 202 "Financial". Node 230's parent IS 202, so these three were orphaned
-- into a stray top-level "Cost Breakdown" group and disappeared from the
-- formula-builder measure picker's Financial ▸ Cost Breakdown list, while
-- their 5 siblings (Electricity O&M/Purchases/Staff, Other O&M/Staff)
-- correctly sat under group 202.
--
-- This only affects picker/tree placement (measures_group_id is taxonomy);
-- it does NOT touch measure applicability / conditional-on-services scope.
--
-- Affected:
--   145  Fuel & Oil Expenditure
--   148  Duty and Taxes - Fuel & Oil
--   149  Duty and Taxes - Others
--
-- Idempotent: re-running is a no-op once group_id is already 202.

UPDATE measure_definitions
SET measures_group_id = 202            -- Financial (parent of subgroup 230)
WHERE id IN (145, 148, 149)
  AND measures_group_id = 230;         -- guard: only fix the stray rows

-- Verify (expect all three: group 202 / subgroup 230):
-- SELECT id, name, measures_group_id, measures_subgroup_id
-- FROM measure_definitions WHERE id IN (145, 148, 149) ORDER BY id;
