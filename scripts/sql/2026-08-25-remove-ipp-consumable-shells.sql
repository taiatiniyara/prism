-- Remove consumable-input shells (Fuel Oil 380, Lubrication Oil 381 — the "Fuel and Oil"
-- subgroup) for IPP-provided units. Per Eugene 2026-08-25 + data: lube oil is NEVER filled
-- for any IPP across the whole migration (0/12), and fuel oil only twice (2/12) — because
-- fuel + lube oil are the IPP OPERATOR's consumables, not the purchasing utility's. A
-- utility benchmarks an IPP's OUTPUT (capacity/generation/downtime @ provider=IPP), never
-- its inputs. The extract was inconsistent (some IPP consumable shells created, PNG's not);
-- this makes the rule uniform: IPP units carry output metrics only, no consumables.
--
-- SOFT-delete (is_deleted=true) — reversible; preserves the 2 filled Fuel Oil @ IPP values
-- in case they're wanted. 24 shells (12 Fuel Oil incl. 2 filled, 12 Lubrication Oil empty).
-- Applied to dev 2026-08-25. Run per environment. Idempotent.

UPDATE data_entries
  SET is_deleted = true, updated_at = now()
  WHERE measure_def_id IN (380, 381)                       -- Fuel and Oil consumables
    AND provider_id = (SELECT id FROM managed_list_items WHERE name = 'IPP' LIMIT 1)
    AND is_deleted = false;
