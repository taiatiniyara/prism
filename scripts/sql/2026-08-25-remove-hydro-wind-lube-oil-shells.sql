-- Remove spurious Lubrication Oil (381) shells on hydro/wind technologies.
-- Per Eugene 2026-08-25 + world-practice research: lube-oil CONSUMPTION is an operational
-- metric for thermal reciprocating engines (Diesel / Heavy Fuel / Natural Gas), where it
-- tracks with running hours. For hydro (sealed, increasingly water-lubricated/oil-free)
-- and wind (periodic gearbox oil, not a per-period consumable) it is not a benchmarking
-- input. 381's declared applicability is {Diesel 46, Heavy Fuel 48, Natural Gas 53}; the
-- extract over-applied it to Hydro Dams (49), Hydro Run-of-River (50) and Wind (55).
--
-- SOFT-delete (is_deleted=true) rather than hard delete — reversible, keeps the audit
-- trail, and preserves the 7 filled Hydro Dams values (the other 188 are no-data/empty)
-- in case they're ever wanted back. All counters (verifier, scorecard) filter is_deleted.
-- 195 shells. Applied to dev 2026-08-25. Run per environment. Idempotent.

UPDATE data_entries
  SET is_deleted = true, updated_at = now()
  WHERE measure_def_id = 381
    AND technology_id NOT IN (46, 48, 53)   -- keep only the thermal applicability
    AND is_deleted = false;
