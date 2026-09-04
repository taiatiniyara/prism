-- #114 Distribution Reliability: unit "%" was wrong — it's an outage density, not
-- a percentage. Set unit to "Events/100km" (managed_list_items 131) and ×100 the
-- formula so the value is per-100km, matching its twin #118 Transmission
-- Reliability ((events / length) * 100). is_currency was already cleared in the
-- 2026-09-03 KPI format fixes. (Eugene-directed 2026-09-03.) Recompute #114 after
-- apply if it has stored values.
UPDATE kpi_definitions
   SET unit_id = 131,
       formula = 'distribution_network_unplanned_downtime_events / distribution_network_length * 100'
 WHERE id = 114;
