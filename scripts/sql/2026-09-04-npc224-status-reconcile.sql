-- §5.2 period-status reconciliation: NPC FY2024 (report_periods id 224) Approved(5) -> Pending(2).
-- Eugene-directed 2026-09-04. It's the only kept opted-out period (bm_opted_in=false); an
-- "Approved-but-not-participating" period is semantically wrong (Approved = the CEO's act on a
-- submitted benchmarking cycle). Its 16 records are KEPT (Eugene). Idempotent guard on status_id=5.
-- Pure data change; git-first.

UPDATE report_periods SET status_id = 2 WHERE id = 224 AND status_id = 5;

-- Verify (expect 224 | bm_opted_in false | status_id 2):
--   SELECT id, bm_opted_in, status_id FROM report_periods WHERE id = 224;
