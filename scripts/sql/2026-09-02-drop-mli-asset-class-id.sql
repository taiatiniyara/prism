-- Drop the dead column managed_list_items.asset_class_id (Eugene-directed 2026-09-02).
--
-- Audit (origin/main): no FK, no view/function, and NO business logic reads it. The only code that
-- touched it was the managed-lists admin editor (display column + create/read/update passthrough),
-- removed in the same PR as this script. Distinct from data_entries.asset_class_id (a live core
-- dimension) and asset_class_relevance — those are separate columns and stay. 1 of 494 rows carried a
-- value (an orphan: item 68348 "Yes" -> 984 "GEN"), backed up below.
--
-- DESTRUCTIVE DDL — apply ONLY AFTER the code removal is LIVE (deploy green + /api/health ok), else the
-- still-live old editor keeps selecting the dropped column and errors (expand/contract; CLAUDE.md).
-- git-first: committed + pushed before running against p2.

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

CREATE TABLE backup.mli_asset_class_pre_drop_20260902 AS
  SELECT id, list_id, name, asset_class_id
  FROM managed_list_items
  WHERE asset_class_id IS NOT NULL;

ALTER TABLE managed_list_items DROP COLUMN asset_class_id;

COMMIT;

-- Verify:
--   -- backup captured the 1 orphan row:
--   SELECT * FROM backup.mli_asset_class_pre_drop_20260902;
--   -- column gone (expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'managed_list_items' AND column_name = 'asset_class_id';
