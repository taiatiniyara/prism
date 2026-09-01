-- ============================================================================
-- Canonical PRISM 2 managed-list names — RE-APPLY AFTER ANY DB RESET / RESTORE.
--
-- Context: these names were renamed on 2026-07-28, then REVERTED to the old
-- "Energy …" / "Data Label …" vocabulary — the DB was reset/restored (or the
-- legacy p1 `/managedList` import, now disabled, re-populated old names).
-- This is the durable fix: run it whenever managed_lists is repopulated to put
-- the PRISM 2 names back. Fully ID-BASED + idempotent (re-runs are safe no-ops).
--
-- Companion protections (same PR):
--   - app/migration/service.ts retrieveManagedLists() is now a NO-OP (won't
--     re-import old names from p1).
--   - scripts/seed.ts seeds the new names for a fresh DB.
--
-- NOTE: ids below are the LIVE/production managed_lists ids. A fresh seed uses
-- different (sequential) ids — seed.ts handles that case with the names directly.
-- ============================================================================
begin;

update managed_lists set name = 'Strata'            where id = 1;   -- was Aggregation Level
update managed_lists set name = 'Provider'          where id = 2;   -- was Energy Provider
update managed_lists set name = 'Category'          where id = 3;   -- was Energy Type
update managed_lists set name = 'Technology'        where id = 4;   -- was Energy Source
update managed_lists set name = 'UoM'               where id = 6;   -- was Units
update managed_lists set name = 'Measures Group'    where id = 12;  -- was Data Label Category
update managed_lists set name = 'Measures Subgroup' where id = 13;  -- was Data Label Sub-Category
update managed_lists set name = 'Asset Class'       where id = 55;  -- was Energy Resource Type

update managed_list_items set name = 'Unit'         where id = 1;   -- was Equipment (level-1 grain)

commit;

-- Verify:
--   SELECT id, name FROM managed_lists WHERE id IN (1,2,3,4,6,12,13,55) ORDER BY id;
--   expect: 1 Strata · 2 Provider · 3 Category · 4 Technology · 6 UoM
--           12 Measures Group · 13 Measures Subgroup · 55 Asset Class
