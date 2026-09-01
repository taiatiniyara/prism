-- ============================================================================
-- Synchronise managed-list / item names to the new energy-taxonomy vocabulary.
--
-- ⚠ RUN BY A DB-ENABLED SESSION (no live DB in the authoring session).
--   Must land ATOMICALLY with the companion code rename (managedListName
--   strings + display fields/labels), or the app's list lookups break.
--   BACKUP FIRST:
--     create table backup.managed_lists_pre_vocab_20260728 as table managed_lists;
--     create table backup.managed_list_items_pre_vocab_20260728
--       as select id, name from managed_list_items where id = 1;
--
-- Idempotent: sets each name to its target regardless of current value.
-- ============================================================================
begin;

-- Eugene's explicit changes (2026-07-28):
update managed_lists      set name = 'Strata'      where id = 1;   -- was "Aggregation Level" (→ strata_id)
update managed_lists      set name = 'Asset Class' where id = 55;  -- was "Energy Resource Type" (→ asset_class_id)
update managed_list_items set name = 'Unit'        where id = 1;   -- was "Equipment" (level-1 grain = unit)

-- Vocabulary completion so the code's managedListName lookups all match
-- (energy_* → new names). Some of these may already carry the new name from
-- the 2026-07-23 taxonomy pass; the set-to-target is a safe no-op then.
update managed_lists set name = 'Category'   where name in ('Energy Type');            -- energy_type   → category
update managed_lists set name = 'Technology' where name in ('Energy Source');          -- energy_source → technology
update managed_lists set name = 'Provider'   where name in ('Energy Provider');        -- energy_provider → provider

commit;

-- Verify:
--   select id, name from managed_lists where id in (1,3,4,55) or name in
--     ('Provider','Category','Technology','Asset Class','Strata');
--   select id, name from managed_list_items where id = 1;
