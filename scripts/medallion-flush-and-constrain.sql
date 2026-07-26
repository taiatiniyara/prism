-- ============================================================================
-- MIGRATION-DAY RUNBOOK: flush data_entries, then constrain the empty table.
-- Companion to docs/database-build-spec.md §4.  Run INSIDE the migration window,
-- immediately before the reload.  Re-runnable.
-- Prerequisites: managed-list members exist (canonical ids), measure collapse done,
-- measure_dimension_scope populated.
-- ============================================================================

BEGIN;

-- 0. FLUSH (cascades to data_entry_logs by FK)
TRUNCATE TABLE data_entries CASCADE;

-- 1. At most one typed value per row
ALTER TABLE data_entries DROP CONSTRAINT IF EXISTS chk_one_value;
ALTER TABLE data_entries ADD CONSTRAINT chk_one_value
  CHECK (num_nonnulls(value_numeric, value_boolean, value_option_id, value_text) <= 1);

-- 2. Dimension columns: All-member defaults + NOT NULL
ALTER TABLE data_entries
  ALTER COLUMN energy_provider_id      SET DEFAULT 20,
  ALTER COLUMN energy_type_id          SET DEFAULT 30,
  ALTER COLUMN energy_source_id        SET DEFAULT 40,
  ALTER COLUMN energy_resource_type_id SET DEFAULT 983,
  ALTER COLUMN customer_type_id        SET DEFAULT 690,
  ALTER COLUMN payment_mode_id         SET DEFAULT 720,
  ALTER COLUMN consumption_band_id     SET DEFAULT 1005,
  ALTER COLUMN division_id             SET DEFAULT 1011,
  ALTER COLUMN gender_id               SET DEFAULT 1022,
  ALTER COLUMN utility_function_id     SET DEFAULT 1023,
  ALTER COLUMN region                  SET DEFAULT 'Pacific';

ALTER TABLE data_entries
  ALTER COLUMN energy_provider_id      SET NOT NULL,
  ALTER COLUMN energy_type_id          SET NOT NULL,
  ALTER COLUMN energy_source_id        SET NOT NULL,
  ALTER COLUMN energy_resource_type_id SET NOT NULL,
  ALTER COLUMN customer_type_id        SET NOT NULL,
  ALTER COLUMN payment_mode_id         SET NOT NULL,
  ALTER COLUMN consumption_band_id     SET NOT NULL,
  ALTER COLUMN division_id             SET NOT NULL,
  ALTER COLUMN gender_id               SET NOT NULL,
  ALTER COLUMN utility_function_id     SET NOT NULL,
  ALTER COLUMN service_area_id         SET NOT NULL,
  ALTER COLUMN utility_id              SET NOT NULL,
  ALTER COLUMN country_id              SET NOT NULL,
  ALTER COLUMN subregion_id            SET NOT NULL,
  ALTER COLUMN region                  SET NOT NULL;

-- 3. True unique address (replaces the legacy non-unique 8-column index)
DROP INDEX IF EXISTS uniq_entry;
DROP INDEX IF EXISTS uniq_entry_address;
CREATE UNIQUE INDEX uniq_entry_address ON data_entries (
  report_period_id, service_area_id, measure_def_id,
  energy_provider_id, energy_type_id, energy_source_id, energy_resource_type_id,
  customer_type_id, payment_mode_id, consumption_band_id,
  division_id, gender_id, utility_function_id,
  COALESCE(energy_resource_id, 0)
) WHERE is_deleted = false;

-- 4. Query indexes
CREATE INDEX IF NOT EXISTS idx_entries_period_measure ON data_entries (report_period_id, measure_def_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_entries_utility        ON data_entries (utility_id, report_period_id)     WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_entries_status         ON data_entries (status_id)                        WHERE is_deleted = false;

COMMIT;

-- Post-run verification (expect: 0 rows, constraints listed):
--   SELECT count(*) FROM data_entries;
--   SELECT conname FROM pg_constraint WHERE conrelid = 'data_entries'::regclass AND contype = 'c';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'data_entries';
