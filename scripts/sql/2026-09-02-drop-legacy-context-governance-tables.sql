-- Retire the two dead pre-medallion "context" tables (Eugene-approved, 2026-09-02).
--
-- Both are EMPTY (0 rows) and superseded: utility-context and governance values are single-homed in
-- data_entries (subgroups 222 "Utility Context" / 240 "Governance Context"), entered per report
-- period and read by factUtilityContextData / factGovernance. These legacy tables (dl_def_id-based,
-- pre-medallion) were only wired to the orphaned /settings/utility-context and /settings/governance
-- pages — removed in this same PR — which wrote to tables nothing else read (a silent trap).
--
-- Verified 0 rows before drop. Single p2 instance — applying here IS applying to prod.
-- (No backup needed — both tables are empty; DDL removed from schema in this PR, git-first.)

BEGIN;
DROP TABLE IF EXISTS utility_context_data;
DROP TABLE IF EXISTS governance_data;
COMMIT;

-- Verify (expect 0 rows):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('utility_context_data','governance_data');
