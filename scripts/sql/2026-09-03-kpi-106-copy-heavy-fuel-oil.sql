-- Eugene-directed 2026-09-03 (#3). Follow-up to the rename migration:
-- (a) The kpi_definitions id sequence was left behind after the p1 import (rows
--     carry explicit ids up to 145 but kpi_definitions_id_seq was at 1), so
--     nextval() collided on insert. Align it to max(id).
-- (b) Copy KPI 106 ("Diesel Fuel Oil Consumption") as "Heavy Fuel Oil
--     Consumption" (corrected name; the earlier "Heavy Fuel Fuel Oil
--     Consumption" was a typo and was never inserted). 106 has no
--     formula_binding rows (legacy formula_inputs JSON) → single-row clone.
--     Idempotent via NOT EXISTS.

SELECT setval('kpi_definitions_id_seq', (SELECT MAX(id) FROM kpi_definitions));

INSERT INTO kpi_definitions
  (name, description, formula, formula_inputs, category_id, subcategory_id,
   strata_id, is_aggregated, is_active, unit_id, block, is_currency,
   is_descriptive, utility_ids, owner_utility_id, type, limits, targets,
   is_kpi_input, owner_user_id, is_private, definition, synonyms,
   definition_status)
SELECT
  'Heavy Fuel Oil Consumption', description, formula, formula_inputs,
   category_id, subcategory_id, strata_id, is_aggregated, is_active, unit_id,
   block, is_currency, is_descriptive, utility_ids, owner_utility_id, type,
   limits, targets, is_kpi_input, owner_user_id, is_private, definition,
   synonyms, definition_status
FROM kpi_definitions
WHERE id = 106
  AND NOT EXISTS (
    SELECT 1 FROM kpi_definitions WHERE name = 'Heavy Fuel Oil Consumption'
  );
