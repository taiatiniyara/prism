-- Medallion Phase 7: Retire Endorsed status
-- Maps all Endorsed (6) rows to Approved (5)

BEGIN;

DO $$
DECLARE
  endorsed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO endorsed_count
  FROM data_entries
  WHERE status_id = 6 AND is_deleted = false;

  RAISE NOTICE 'Re-pointing % Endorsed entries → Approved', endorsed_count;

  UPDATE data_entries
  SET status_id = 5
  WHERE status_id = 6
    AND is_deleted = false;
END $$;

COMMIT;
