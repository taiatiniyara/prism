-- Total Costs (calculated measure 230): revert ALL input dimension pins to All.
-- It's a total ACROSS all providers/functions/technologies, not a slice — the
-- specific pins (provider=Utility/IPP, staff utility_function=1025, fuel
-- technology=46) matched little/no data and caused 110/140 compute errors.
-- Set both the formula_binding source of truth (formula_binding_dimension) AND
-- the derived formula_inputs JSON cache to the All-member ids
-- (provider 20, utility_function 1023, technology 40). Eugene-directed 2026-09-03.
-- Recompute Total Costs after apply.

UPDATE formula_binding_dimension
   SET member_id = CASE dimension_key
     WHEN 'provider_id' THEN 20
     WHEN 'utility_function_id' THEN 1023
     WHEN 'technology_id' THEN 40
     ELSE member_id END
 WHERE binding_id IN (172,173,174,175,176,177,178,179);

UPDATE measure_definitions
   SET formula_inputs = (
     SELECT jsonb_agg(
       elem || jsonb_build_object('provider_id', 20, 'utility_function_id', 1023, 'technology_id', 40))
     FROM jsonb_array_elements(formula_inputs::jsonb) elem)
 WHERE id = 230;
