-- 2026-09-08 — NPC (Niue Power Corporation, org 17): opt FY2024 into benchmarking
--
-- WHY: Participation is now tracked PER financial year on report_periods.bm_opted_in
-- (the org-level organisations.bm_participates is derived: is_utility AND any period
-- opted in). NPC must participate in benchmarking for BOTH FY2024 and FY2025.
--   period 224 = FY2024 (report_date 2024-06-29, report_type 490=Financial Year) → was false
--   period 254 = FY2025 (report_date 2025-06-29)                                → already true
-- This sets FY2024 true; FY2025 is included idempotently so intent is explicit.
--
-- SAFE: touches only the bm_opted_in flag on two specific NPC periods. No data rows moved.
-- Verify-only: re-run the SELECT at the end; both rows should show bm_opted_in = true.

BEGIN;

UPDATE report_periods
SET bm_opted_in = true,
    updated_at  = now()
WHERE utility_id = 17          -- Niue Power Corporation
  AND id IN (224, 254)         -- FY2024, FY2025
  AND report_type_id = 490     -- Financial Year (guard)
  AND bm_opted_in = false;     -- idempotent: only flip the ones not already opted in

-- Expect: 1 row updated (period 224; 254 already true).
-- Confirm before COMMIT:
--   SELECT id, report_date, bm_opted_in FROM report_periods
--   WHERE utility_id = 17 ORDER BY report_date;

COMMIT;
