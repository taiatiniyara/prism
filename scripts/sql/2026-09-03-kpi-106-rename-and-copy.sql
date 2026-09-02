-- Eugene-directed 2026-09-03 (#3):
-- (1) Rename KPI 106 "Engine Oil Consumption" → "Diesel Fuel Oil Consumption".
-- (2) Duplicate it as a new KPI "Heavy Fuel Fuel Oil Consumption" (name per
--     Eugene's exact wording — flagged as a possible typo for "Heavy Fuel Oil
--     Consumption"). KPI 106 has NO formula_binding rows (it uses the legacy
--     formula_inputs JSON), so the copy is a single kpi_definitions row clone;
--     id + updated_at are left to default. Idempotent via NOT EXISTS.

UPDATE kpi_definitions SET name = 'Diesel Fuel Oil Consumption' WHERE id = 106;

INSERT INTO kpi_definitions
  (name, description, formula, formula_inputs, category_id, subcategory_id,
   strata_id, is_aggregated, is_active, unit_id, block, is_currency,
   is_descriptive, utility_ids, owner_utility_id, type, limits, targets,
   is_kpi_input, owner_user_id, is_private, definition, synonyms,
   definition_status)
SELECT
  'Heavy Fuel Fuel Oil Consumption', description, formula, formula_inputs,
   category_id, subcategory_id, strata_id, is_aggregated, is_active, unit_id,
   block, is_currency, is_descriptive, utility_ids, owner_utility_id, type,
   limits, targets, is_kpi_input, owner_user_id, is_private, definition,
   synonyms, definition_status
FROM kpi_definitions
WHERE id = 106
  AND NOT EXISTS (
    SELECT 1 FROM kpi_definitions WHERE name = 'Heavy Fuel Fuel Oil Consumption'
  );
