-- Medallion Phase 2c: Collapse 515 measure_definitions  → ~55-65 measure_definitions
-- Creates the migration mapping infrastructure.
-- The actual measure family mapping data comes from the p1_dl_def_ids_raw.xlsx classifier.

BEGIN;

-- 1. Create migration mapping table
CREATE TABLE IF NOT EXISTS measure_def_migration_map (
  id SERIAL PRIMARY KEY,
  legacy_input_def_id INTEGER NOT NULL REFERENCES measure_definitions (id) ON DELETE CASCADE,
  new_measure_id INTEGER NOT NULL REFERENCES measure_definitions (id) ON DELETE CASCADE,
  energy_provider_id INTEGER REFERENCES managed_list_items(id),
  energy_type_id INTEGER REFERENCES managed_list_items(id),
  energy_source_id INTEGER REFERENCES managed_list_items(id),
  customer_type_id INTEGER REFERENCES managed_list_items(id),
  payment_mode_id INTEGER REFERENCES managed_list_items(id),
  consumption_band_id INTEGER REFERENCES managed_list_items(id),
  division_id INTEGER REFERENCES managed_list_items(id),
  gender_id INTEGER REFERENCES managed_list_items(id),
  confidence VARCHAR(16) NOT NULL DEFAULT 'high',
  is_mechanical BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(legacy_input_def_id)  -- one legacy def → one (measure × dimension tuple)
);

-- 2. Create a "Measure Category" marker to distinguish measures from input defs
--    We use is_aggregated as a temporary flag, or add a new column.
--    For now, create measures as new rows in measure_definitions  that represent
--    the collapsed/"pure" measure (no dimension words in name).

-- 3. Create a function to insert a measure from an input definition template
CREATE OR REPLACE FUNCTION create_measure_from_template(
  p_name VARCHAR(255),
  p_variable_name VARCHAR(255),
  p_definition TEXT,
  p_unit_id INTEGER,
  p_data_type_id INTEGER,
  p_category_id INTEGER,
  p_subcategory_id INTEGER,
  p_agg_level_id INTEGER,
  p_valid_range_min NUMERIC DEFAULT NULL,
  p_valid_range_max NUMERIC DEFAULT NULL,
  p_is_mandatory BOOLEAN DEFAULT false,
  p_is_calculated BOOLEAN DEFAULT false
) RETURNS INTEGER AS $$
DECLARE
  new_id INTEGER;
BEGIN
  INSERT INTO measure_definitions  (
    name,
    variable_name,
    definition,
    category_id,
    subcategory_id,
    unit_id,
    data_type_id,
    agg_level_id,
    valid_range_min,
    valid_range_max,
    is_mandatory,
    is_calculated,
    is_active,
    is_aggregated,
    definition_status
  ) VALUES (
    p_name,
    p_variable_name,
    p_definition,
    p_category_id,
    p_subcategory_id,
    p_unit_id,
    p_data_type_id,
    p_agg_level_id,
    p_valid_range_min,
    p_valid_range_max,
    p_is_mandatory,
    p_is_calculated,
    true,   -- is_active
    true,   -- is_aggregated (marks this as a measure, not a leaf input def)
    'draft' -- definition_status
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Create a function to map a legacy input def to a measure with dimension context
CREATE OR REPLACE FUNCTION map_legacy_to_measure(
  p_legacy_input_def_id INTEGER,
  p_new_measure_id INTEGER,
  p_energy_provider_id INTEGER DEFAULT NULL,
  p_energy_type_id INTEGER DEFAULT NULL,
  p_energy_source_id INTEGER DEFAULT NULL,
  p_customer_type_id INTEGER DEFAULT NULL,
  p_payment_mode_id INTEGER DEFAULT NULL,
  p_consumption_band_id INTEGER DEFAULT NULL,
  p_division_id INTEGER DEFAULT NULL,
  p_gender_id INTEGER DEFAULT NULL,
  p_confidence VARCHAR DEFAULT 'high',
  p_is_mechanical BOOLEAN DEFAULT true
) RETURNS VOID AS $$
BEGIN
  INSERT INTO measure_def_migration_map (
    legacy_input_def_id,
    new_measure_id,
    energy_provider_id,
    energy_type_id,
    energy_source_id,
    customer_type_id,
    payment_mode_id,
    consumption_band_id,
    division_id,
    gender_id,
    confidence,
    is_mechanical
  ) VALUES (
    p_legacy_input_def_id,
    p_new_measure_id,
    p_energy_provider_id,
    p_energy_type_id,
    p_energy_source_id,
    p_customer_type_id,
    p_payment_mode_id,
    p_consumption_band_id,
    p_division_id,
    p_gender_id,
    p_confidence,
    p_is_mechanical
  )
  ON CONFLICT (legacy_input_def_id) DO UPDATE SET
    new_measure_id = EXCLUDED.new_measure_id,
    energy_provider_id = EXCLUDED.energy_provider_id,
    energy_type_id = EXCLUDED.energy_type_id,
    energy_source_id = EXCLUDED.energy_source_id,
    customer_type_id = EXCLUDED.customer_type_id,
    payment_mode_id = EXCLUDED.payment_mode_id,
    consumption_band_id = EXCLUDED.consumption_band_id,
    division_id = EXCLUDED.division_id,
    gender_id = EXCLUDED.gender_id,
    confidence = EXCLUDED.confidence,
    is_mechanical = EXCLUDED.is_mechanical;
END;
$$ LANGUAGE plpgsql;

-- 5. Create a summary view of the migration mapping
CREATE OR REPLACE VIEW v_measure_migration_summary AS
SELECT
  mm.new_measure_id,
  idf.name AS measure_name,
  COUNT(*) AS legacy_defs_mapped,
  COUNT(*) FILTER (WHERE mm.is_mechanical) AS mechanical_maps,
  COUNT(*) FILTER (WHERE NOT mm.is_mechanical) AS judgment_maps,
  STRING_AGG(DISTINCT mm.confidence, ', ') AS confidence_levels
FROM measure_def_migration_map mm
INNER JOIN measure_definitions  idf ON idf.id = mm.new_measure_id
GROUP BY mm.new_measure_id, idf.name
ORDER BY legacy_defs_mapped DESC;

COMMIT;
