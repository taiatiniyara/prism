-- KPI display-format corrections (Eugene-directed 2026-09-03, #3).
-- Context: the harness/dashboard format checks is_currency FIRST, so a true flag
-- overrides a "%" or rate unit and wrongly renders "$". These KPIs are
-- percentages or count/duration rates — never currency.
--
-- FIX 1 — clear is_currency (unit unchanged) on 21 KPIs:
--   14 with unit "%": 23,24,25,26,27,28,29,30,31,32,112,113,114,117
--   7 with a rate unit (Cost/km, Customers/Employee, Outages/100km,
--      Minutes/Customer, Events/Customer): 115,116,118,119,120,121,122
-- Genuinely-currency KPIs (Customer Sales, GDP per Capita, tariff/lifeline kWh
-- bands 127-135) are intentionally left is_currency = true.
UPDATE kpi_definitions
   SET is_currency = false
 WHERE id IN (23,24,25,26,27,28,29,30,31,32,112,113,114,115,116,117,118,119,120,121,122);

-- FIX 2 — remove the in-formula "* 100" from the two employee-% KPIs so the
-- stored value is a RATIO (matching the ~10 sibling employee-% KPIs that
-- divide-only); the "%" unit applies the x100 at display time. Without this the
-- new %-formatter would double it (0.45 -> 4500%). Recompute #64/#65 after apply.
UPDATE kpi_definitions SET formula = 'employees_male / employees_total'   WHERE id = 64;
UPDATE kpi_definitions SET formula = 'employees_female / employees_total' WHERE id = 65;
