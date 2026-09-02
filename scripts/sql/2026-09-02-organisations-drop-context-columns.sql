-- Retire the 3 utility-context columns on organisations (Stage 2, Eugene-directed 2026-09-02).
--
-- accounting_standard_id / electricity_regulation_id / powerquality_standard_id are utility-REPORTED
-- context answers (measures 51 Accounting Standards / 53 Electricity Regulation / 52 Power Quality
-- Standards, subgroup 222). Their home is data_entries via the ratified reporting workflow, not org
-- columns — the columns were a p1-era duplicate. #11's org form no longer reads/writes them
-- (PR #252), the migration + onboarding writers are removed in the same PR as this script, and no app
-- reader remains (factUtilityContextData reads data_entries subgroup 222).
--
-- entity_type_id STAYS — it's the registration/tenancy axis (#10), not a per-FY reported answer.
--
-- DATA SAFETY (Option B, Eugene's call — backup + clean drop, no synthesized "approved" history):
-- reconciliation found 7 utilities (EDT, EEWF, ENERCAL, GPA, KAJUR, NPC, VU) whose accounting/
-- electricity value lives ONLY in the org column (no data_entries) — 14 legacy values (4 are the
-- "Undeclared" null-equivalent; VU has no report_period so it could not be backfilled anyway). These
-- values are already dark (no live consumer). We snapshot every org's 3 column values to a backup
-- table first, so nothing is unrecoverable; the real values re-enter through the normal workflow when
-- these utilities report for the 2026 cycle.
--
-- DROP COLUMN also drops the associated managed_list_items FK constraints automatically.
--
-- git-first: schema (db/schema/utility.ts) + writer removals + this script merged to main BEFORE
-- running against p2 (single instance).

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

-- Full snapshot of all orgs' 3 context columns (recoverable source of the retired values).
CREATE TABLE backup.organisations_context_pre_drop_20260902 AS
  SELECT id, acronym,
         accounting_standard_id,
         electricity_regulation_id,
         powerquality_standard_id
  FROM organisations;

ALTER TABLE organisations
  DROP COLUMN accounting_standard_id,
  DROP COLUMN electricity_regulation_id,
  DROP COLUMN powerquality_standard_id;

COMMIT;

-- Verify:
--   -- backup captured (expect = organisations row count; 26 non-null for accounting/electricity):
--   SELECT count(*) AS rows,
--          count(accounting_standard_id) AS acc, count(electricity_regulation_id) AS elec,
--          count(powerquality_standard_id) AS pq
--   FROM backup.organisations_context_pre_drop_20260902;
--   -- columns gone (expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'organisations'
--     AND column_name IN ('accounting_standard_id','electricity_regulation_id','powerquality_standard_id');
