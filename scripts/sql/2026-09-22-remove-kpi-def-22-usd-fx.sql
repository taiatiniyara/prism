-- 2026-09-22 (#2, Eugene-directed) — remove kpi_definitions id 22 "USD Exchange Rate"
--
-- It's a country-context indicator (its own definition: "describes the utility's operating
-- environment, not utility performance"), mis-classified as a benchmarking KPI. Eugene: remove
-- it from kpi_definitions.
--
-- Reference sweep (read-only, before): the ONLY inbound reference is 79 rows in the `kpi`
-- actuals table (kpi_def_id=22, all actual_value, 0 targets) — the stored FX values. Zero rows
-- in bsc_kpi_link / bsc_kpi_target_plan / kpi_actual / kpi_target / kpi_calculation_attempts /
-- custom_kpi_request. The `kpi` FK is NO ACTION, so its 79 rows must be deleted first.
-- (The USD-FX *measure* used for currency conversion of monetary KPIs is a measure_definitions
-- row, NOT this kpi_definitions row — untouched. Deleting this KPI does not affect conversion.)
--
-- Destructive → backup-first + guarded (scoped to id 22). git-first: merged before apply.

BEGIN;

-- backups (idempotent; won't overwrite an existing snapshot)
CREATE TABLE IF NOT EXISTS backup.kpi_def_22_20260922         AS SELECT * FROM kpi_definitions WHERE id = 22;
CREATE TABLE IF NOT EXISTS backup.kpi_actuals_def22_20260922  AS SELECT * FROM kpi             WHERE kpi_def_id = 22;

-- delete the dependent actuals first (NO ACTION FK), then the definition
DELETE FROM kpi             WHERE kpi_def_id = 22;   -- expect 79
DELETE FROM kpi_definitions WHERE id = 22;           -- expect 1

COMMIT;

-- Verify:
--   SELECT count(*) FROM kpi_definitions WHERE id = 22;   -- 0
--   SELECT count(*) FROM kpi WHERE kpi_def_id = 22;       -- 0
--   SELECT count(*) FROM backup.kpi_def_22_20260922;      -- 1  (recoverable)
--   SELECT count(*) FROM backup.kpi_actuals_def22_20260922; -- 79 (recoverable)
