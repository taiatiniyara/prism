-- 2026-09-21 (#2) — period dimension STEP 1, part 2: fye_day key fix + populate FY buckets
--
-- Follows PR #524 (empty period table). #8 semantics sign-off received: FY-start-year labelling
-- via fiscal_year_for_report_period confirmed; window formula verified across all live FYE
-- conventions; the 3 mid-FY report_date periods (NPC 224, EEC 237/238) accepted as fn-as-truth
-- (routed to data-quality triage — fix inputs, never bucket outputs).
--
-- #8's latent-collision flag: the STEP-1 unique key was (kind, fy_year, fy_end_month) — a future
-- Jun-15 vs Jun-30 FYE pair would collide silently. Fix: add fy_end_day to the table + unique key.
-- Table is empty so this is safe. Additive/idempotent. git-first: merged before apply.

BEGIN;

-- fye_day fix (table empty → safe to re-key)
ALTER TABLE period ADD COLUMN IF NOT EXISTS fy_end_day smallint;
ALTER TABLE period DROP CONSTRAINT IF EXISTS uniq_period_fy;
ALTER TABLE period ADD CONSTRAINT uniq_period_fy UNIQUE (kind, fy_year, fy_end_month, fy_end_day);
ALTER TABLE period ADD CONSTRAINT chk_period_fy_end_day
  CHECK (fy_end_day IS NULL OR fy_end_day BETWEEN 1 AND 31);

-- Populate FY buckets: one row per DISTINCT (fy_year, fye_month, fye_day) over the FY report periods.
-- fy_year = FY-START year via the canonical fn (single time-truth). Window:
--   end_year     = (fye is 31 Dec) ? fy_year : fy_year+1
--   period_end   = the FY-end date (fye_month/fye_day in end_year)
--   period_start = day after the prior FY-end (contiguous, non-overlapping)
INSERT INTO period (kind, fy_year, fy_end_month, fy_end_day, period_start, period_end, label)
SELECT 'financial_year', b.fy_year, b.m, b.d,
       make_date(b.end_year - 1, b.m, b.d) + 1,   -- period_start
       make_date(b.end_year,     b.m, b.d),        -- period_end
       'FY' || b.fy_year
FROM (
  SELECT DISTINCT fy_year, m, d,
         CASE WHEN m = 12 AND d = 31 THEN fy_year ELSE fy_year + 1 END AS end_year
  FROM (
    SELECT fiscal_year_for_report_period(rp.report_date::date, 'Financial Year', o.fye_month, o.fye_day) AS fy_year,
           o.fye_month AS m, o.fye_day AS d
    FROM report_periods rp
    JOIN organisations o ON o.id = rp.utility_id
    WHERE rp.report_type_id = 490
  ) x
) b
ON CONFLICT (kind, fy_year, fy_end_month, fy_end_day) DO NOTHING;
-- Expect: 17 rows.

COMMIT;

-- Verify:
--   SELECT kind, fy_year, fy_end_month, fy_end_day, period_start, period_end, label FROM period ORDER BY fy_end_month, fy_end_day, fy_year;
--   -- 17 rows; every FY report_period's (fy_year, fye) matches a period row.
