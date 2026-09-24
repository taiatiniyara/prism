-- KPI 33 "Revenue"'s only formula input (service_revenue) points to
-- measure_def_id 1300, which does not exist in measure_definitions — the
-- KPI can never compute. Every sibling Financial KPI (34 Operating Cost
-- Recovery, 35 Operating Ratio, 37 Debtor Days, 44 Profit Margin, 109
-- Customer Sales) binds the equivalent variable to measure_def_id 200
-- ("Revenue", active, 80 data_entries rows). Repoint KPI 33 to match.
-- KPI 33 has zero formula_binding rows (still legacy-JSON-only) — this is a
-- direct JSON patch, no formula_binding_dimension change needed.
-- See docs/superpowers/plans/2026-09-25-kpi-formula-binding-fixes.md Task 3.

BEGIN;

UPDATE kpi_definitions
   SET formula_inputs = (
     SELECT jsonb_agg(
       CASE
         WHEN elem->>'variable_name' = 'service_revenue'
         THEN elem || jsonb_build_object('measure_def_id', 200)
         ELSE elem
       END
     )
     FROM jsonb_array_elements(formula_inputs::jsonb) elem
   )
 WHERE id = 33;

COMMIT;
