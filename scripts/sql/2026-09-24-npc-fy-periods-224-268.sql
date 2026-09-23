-- 2026-09-24 (#2, Eugene-directed) — correct NPC (org 17) FY period structure
--
-- NPC (Niue Power Corporation), FYE 30 Jun. Eugene confirmed the true structure:
--   224 = FY2023 (year-ending Jun 2023) — has 113 data rows; its report_date was WRONG
--         (2023-12-31T12:00Z = local 2024-01-01), which made it masquerade as FY2024 and
--         collide with the real FY2024 period (268), causing 268's drop in the FYE cleanup.
--   268 = FY2024 (year-ending Jun 2024) — the "gap" period NPC created; 119 no-data rows in the
--         p1 extract. Dropped 2026-08-30 as an empty collision; NPC opted in, so restore it.
--   254 = FY2025 (year-ending Jun 2025) — already correct (report_date 2025-06-29T12:00Z). No change.
--
-- Storage convention: local FY-end Jun-30-YYYY is stored as YYYY-06-29T12:00:00Z (Fiji-midnight;
-- matches 254). git-first: committed + merged before apply. Guarded. The 119 no-data rows for
-- period 268 are loaded separately via the loader (loadExtract on the filtered extract) after this.
-- Sequence: report_periods_id_seq is at 413 (> 268) → explicit-id insert needs NO realignment.

BEGIN;

-- 1. Fix 224 → FY2023 (local Jun-30-2023). Relabels the period; its 113 data rows are unaffected
--    (linked by report_period_id, not date). Guarded on the current wrong value.
UPDATE report_periods
SET report_date = '2023-06-29 12:00:00+00', updated_at = now()
WHERE id = 224 AND utility_id = 17
  AND report_date = '2023-12-31 12:00:00+00';
-- Expect: 1 row.

-- 2. Recreate period 268 = FY2024 (local Jun-30-2024), NPC, opted-in, Pending (empty gap, no data yet).
INSERT INTO report_periods
  (id, utility_id, report_type_id, report_date, request_date, status_id, who_id, lean_mode, bm_opted_in, updated_at)
VALUES
  (268, 17, 490, '2024-06-29 12:00:00+00', now(), 2, NULL, false, true, now())
ON CONFLICT (id) DO NOTHING;
-- Expect: 1 row. status 2 = Pending (nothing approved; NPC to fill FY2024).

COMMIT;

-- Verify:
--   SELECT id, to_char(report_date,'YYYY-MM-DD"T"HH24:MI"Z"') d, status_id, bm_opted_in,
--          fiscal_year_for_report_period(report_date::date,'Financial Year',6,30) fn_start_year
--   FROM report_periods WHERE utility_id=17 ORDER BY report_date;
--   -- 224 → 2023-06-29 (fn 2022 = FY-ending-2023) · 268 → 2024-06-29 (fn 2023 = FY-ending-2024) ·
--   -- 254 → 2025-06-29 (fn 2024 = FY-ending-2025). Three distinct consecutive FYs, no collision.
