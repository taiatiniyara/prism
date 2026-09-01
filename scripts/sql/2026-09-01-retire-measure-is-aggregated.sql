-- Retire measure_definitions.is_aggregated (Eugene-approved 2026-08-31; applied 2026-09-01).
-- It duplicated is_calculated (both = "derived/computed measure → exclude from manual entry"). The
-- split caused a calc-measure compute bug (builder wrote is_calculated, worker read is_aggregated).
-- Across 119 measures the two flags diverged on 3 legacy mis-flags; only measure 12 (IATA Air
-- Connectivity Score) was is_aggregated=true with is_calculated=false — a stale flag (context-fed,
-- not computed), so NOTHING needs is_calculated flipped to true (230/231 already is_calculated=true).
-- #3's PART 2 (#195) already moved the compute path (target-selector.ts) off is_aggregated onto
-- is_calculated, so the flag has no remaining reader.
--
-- SCOPE: measure_definitions.is_aggregated ONLY. kpi_definitions.is_aggregated (db/schema/kpi.ts) and
-- units.is_aggregated (db/schema/utility.ts) are SEPARATE columns on other tables — untouched.
--
-- CODE (same PR, git-first — merged to main BEFORE this runs): app readers migrated is_aggregated→
-- is_calculated (data-entry/enter-data, settings/relevance, settings/inputs + uploadFromExcel);
-- db/schema/dataEntry.ts column def removed; obsolete one-off scripts guarded / repointed.
--
-- Idempotent. Per-env (dev now, prod at cutover). Backup first:
--   CREATE TABLE backup.measure_definitions_pre_isagg_drop_20260901 AS TABLE measure_definitions;

BEGIN;

-- Confirm the lone stale is_aggregated=true row (measure 12) is not carried over as a compute flag.
-- It is context-fed, not computed → is_calculated stays false. Idempotent (already false on dev).
UPDATE measure_definitions SET is_calculated = false
WHERE id = 12 AND is_calculated IS DISTINCT FROM false;

ALTER TABLE measure_definitions DROP COLUMN IF EXISTS is_aggregated;

COMMIT;

-- Verify (expect 0 rows — column gone):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'measure_definitions' AND column_name = 'is_aggregated';
