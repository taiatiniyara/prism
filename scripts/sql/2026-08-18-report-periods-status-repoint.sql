-- Repoint report_periods.status_id from managed-list 21 ("Data Workflow Status",
-- items 840-845) to the shared DataEntryStatusId enum (1-7) that data_entries uses,
-- and add the lean-workflow flag. Unblocks deletion of managed-list 21.
-- Data + schema change (deploys don't carry the data UPDATE) — run per environment.
-- Applied to dev 2026-08-18. Idempotent-ish: the UPDATE only matches legacy ids.
-- Backup first: create table backup.report_periods_pre_statusrepoint_<yyyymmdd> as table report_periods;

BEGIN;

-- 1. drop the managed-list FK first (enum values would violate it during the update)
ALTER TABLE report_periods
  DROP CONSTRAINT IF EXISTS report_periods_status_id_managed_list_items_id_fk;

-- 2. legacy managed-list ids -> DataEntryStatusId enum
UPDATE report_periods SET status_id = CASE status_id
  WHEN 840 THEN 1  -- Requested
  WHEN 841 THEN 3  -- Entered
  WHEN 842 THEN 2  -- Pending
  WHEN 843 THEN 4  -- BLO Reviewed  -> Reviewed
  WHEN 844 THEN 5  -- CEO Approved  -> Approved
  WHEN 845 THEN 5  -- BMO Endorsed (retired) -> Approved
  ELSE status_id END
WHERE status_id BETWEEN 840 AND 845;

-- 3. lean data-entry workflow flag (BLO-activated, per utility x period)
ALTER TABLE report_periods
  ADD COLUMN IF NOT EXISTS lean_mode boolean NOT NULL DEFAULT false;

COMMIT;

-- After this, managed-list 21 + its items 840-845 are FK-free and can be deleted (#2).
