-- Retire dead measure_definitions.is_kpi + is_kpi_input (Eugene-directed, 2026-09-01).
--
-- is_kpi: 0 measures true, no query reads it — vestigial (KPIs live in kpi_definitions, not measures).
-- is_kpi_input: its ONLY reader was the KPI formula-builder's input picker (GetKpiFormulaBuilderData,
--   app/settings/kpi/service.ts), which is now repointed to offer "all active, non-computed,
--   non-context-fed" measures instead. The compute path (kpi-worker / aggregated-worker / lib/formula)
--   never read either flag — KPI inputs are resolved from each KPI's stored formula_inputs.
--
-- SCOPE: measure_definitions ONLY. kpi_definitions.is_kpi_input (db/schema/kpi.ts) is a SEPARATE, live
-- column on another table — UNTOUCHED.
--
-- CODE (same PR, git-first — merged to main BEFORE this runs): measure is_kpi/is_kpi_input readers &
-- writers removed (settings/inputs service + uploadFromExcel, bulk-create-input-defs), the formula-
-- builder filter repointed, and db/schema/dataEntry.ts column defs removed.
--
-- Single p2 instance — applying here IS applying to prod. Backup first:
--   CREATE TABLE backup.measure_definitions_pre_kpiflags_20260901 AS TABLE measure_definitions;

BEGIN;
ALTER TABLE measure_definitions DROP COLUMN IF EXISTS is_kpi;
ALTER TABLE measure_definitions DROP COLUMN IF EXISTS is_kpi_input;
COMMIT;

-- Verify (expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'measure_definitions' AND column_name IN ('is_kpi', 'is_kpi_input');
