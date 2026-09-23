-- 2026-09-24 (#2) — correction to 2026-09-24-npc-fy-periods-224-268.sql
--
-- That script used a wrong date literal (misled by the pg driver's tz display): report_date is
-- timestamp WITHOUT time zone (session UTC), and the canonical FY-end value is plain midnight
-- 'YYYY-06-30 00:00:00' (matching 254 = '2025-06-30 00:00:00'). Consequences of the first apply:
--   • 224 UPDATE guard didn't match → 224 still '2024-01-01 00:00:00' (wrong; still FY-ending-2024)
--   • 268 created at '2024-06-29 12:00:00' (right FY, off-convention time)
-- This sets both to the canonical midnight FY-end date. git-first; guarded on id+utility.

BEGIN;

-- 224 → FY2023 (year-ending Jun 2023). 113 data rows unaffected (linked by id, not date).
UPDATE report_periods SET report_date = '2023-06-30 00:00:00', updated_at = now()
WHERE id = 224 AND utility_id = 17;

-- 268 → FY2024 (year-ending Jun 2024), canonical midnight.
UPDATE report_periods SET report_date = '2024-06-30 00:00:00', updated_at = now()
WHERE id = 268 AND utility_id = 17;

COMMIT;

-- Verify (fn labels by FY-START year; FY-ending = start+1):
--   SELECT id, report_date::text,
--          fiscal_year_for_report_period(report_date::date,'Financial Year',6,30) AS fn_start_yr
--   FROM report_periods WHERE utility_id=17 ORDER BY report_date;
--   -- 224 '2023-06-30' fn=2022 (FY-ending-2023) · 268 '2024-06-30' fn=2023 (FY-ending-2024) ·
--   -- 254 '2025-06-30' fn=2024 (FY-ending-2025). Three distinct consecutive FYs.
