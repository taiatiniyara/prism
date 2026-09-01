-- ============================================================================
-- data_entries configuration — companion to docs/data-entries-configuration-guide.md
-- PHASE A: safe today. PHASE B: MIGRATION DAY ONLY, immediately after the flush.
-- Postgres 15+. All statements idempotent where possible.
-- ============================================================================

-- ======================= PHASE A — safe today ===============================

-- A1. Scope table: only the ten valid dimension names
ALTER TABLE measure_dimension_scope
  DROP CONSTRAINT IF EXISTS mds_dimension_valid,
  ADD CONSTRAINT mds_dimension_valid CHECK (dimension IN (
    'provider','type','source','resource_type','customer_type',
    'payment_mode','band','division','gender','utility_function'));

-- A2. Scope table: only the three valid expansion modes
ALTER TABLE measure_dimension_scope
  DROP CONSTRAINT IF EXISTS mds_expansion_mode_valid,
  ADD CONSTRAINT mds_expansion_mode_valid CHECK (expansion_mode IN (
    'not_applicable','all_members','by_context'));

-- A3. Scope table: one row per measure per dimension
CREATE UNIQUE INDEX IF NOT EXISTS mds_measure_dimension_uidx
  ON measure_dimension_scope (measure_id, dimension);

-- ================= PHASE B — MIGRATION DAY, AFTER THE FLUSH =================
-- Precondition (MUST return 0):
--   SELECT count(*) FROM data_entries;

-- B1. Dimension defaults = the canonical All members
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
  ALTER COLUMN utility_function_id     SET DEFAULT 1023;

-- B2. Never-empty rules
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
  ALTER COLUMN country_id              SET NOT NULL;
-- Stays nullable BY DESIGN: energy_resource_id, power_station_id, subregion_id, region,
-- value_numeric, value_boolean, value_text, value_option_id, value (legacy), status_id.

-- B3. At most one typed value column filled per row
ALTER TABLE data_entries
  DROP CONSTRAINT IF EXISTS de_one_value_only,
  ADD CONSTRAINT de_one_value_only CHECK (
    num_nonnulls(value_numeric, value_boolean, value_text, value_option_id) <= 1);

-- B4. The address key: one row per complete address
DROP INDEX IF EXISTS uniq_entry;  -- old NON-unique 8-column leftover
ALTER TABLE data_entries
  DROP CONSTRAINT IF EXISTS de_unique_address,
  ADD CONSTRAINT de_unique_address UNIQUE NULLS NOT DISTINCT (
    report_period_id, service_area_id, measure_def_id, energy_resource_id,
    energy_provider_id, energy_type_id, energy_source_id, energy_resource_type_id,
    customer_type_id, payment_mode_id, consumption_band_id,
    division_id, gender_id, utility_function_id);

-- B5. Verification (read-only + reversible probes)
-- B5a. Constraint inventory — expect de_one_value_only (c) and de_unique_address (u):
--   SELECT conname, contype FROM pg_constraint WHERE conrelid = 'data_entries'::regclass
--   AND contype IN ('c','u');
-- B5b. Insert one row omitting every dimension → must succeed with All ids filled:
--   INSERT INTO data_entries (report_period_id, service_area_id, measure_def_id,
--     utility_id, country_id, status_id)
--   VALUES (<period>, <area>, <measure>, <utility>, <country>, 1) RETURNING *;
-- B5c. Repeat the exact same insert → must FAIL (duplicate address).
-- B5d. Try two value columns at once → must FAIL (one-value rule):
--   UPDATE data_entries SET value_numeric = 1, value_boolean = true WHERE id = '<b5b id>';
-- B5e. Clean up the probe row:
--   DELETE FROM data_entries WHERE id = '<b5b id>';
