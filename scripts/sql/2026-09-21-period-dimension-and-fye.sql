-- 2026-09-21 (#2, Eugene-directed via #1) — Tier-2 STEP 1: canonical `period` dimension (structure)
--                                            + FY-end values for the 3 remaining NULL-FYE utilities
--
-- Structural campaign STEP 1 ONLY (spec docs/kpi-time-series-spec.md §3). NON-DESTRUCTIVE.
-- Does NOT touch data_entries, report_periods, or add any FK to them — later greenlights.
--
-- This script lands (a) the FYE data + (b) the empty `period` TABLE. The FY-bucket ROWS are
-- generated in a FOLLOW-UP once #8 verifies the generation reproduces fiscalYearForReportPeriod
-- (FY labelled by FY-START year) for every existing report period — #8's hard requirement.
--
-- git-first: committed + merged before apply. Drizzle model follows post-apply (drift-check
-- errors on model-ahead-of-DB), same clean order as the sector tables.

BEGIN;

-- (a) FY-end = 31 December for the 3 placeholder utilities (Eugene-supplied; all is_utility=true,
--     fye_month/fye_day previously NULL). After this, all 28 utilities have an FY-end so FY buckets
--     can generate for the full set.
--     46 = Vanuatu Utilities (VU) · 51 = Pitcairn Islands Utility (PIU) · 52 = New Zealand Utility (NZU)
UPDATE organisations
SET fye_month = 12, fye_day = 31
WHERE id IN (46, 51, 52)
  AND fye_month IS NULL;   -- idempotent guard
-- Expect: 3 rows updated.

-- (b) The canonical period dimension (time buckets, decoupled from submissions) — spec §3.
--     Utility-agnostic for calendar granularities; FY buckets are shared across utilities with the
--     same FY-end. Only kind='financial_year' is live now; 'month'/'quarter' modelled but dormant (§6).
CREATE TABLE IF NOT EXISTS period (
  id            serial PRIMARY KEY,
  kind          varchar(16) NOT NULL,          -- 'financial_year' | 'month' | 'quarter'
  fy_year       integer,                        -- FY START-year label (e.g. 2024); the benchmark alignment key. FY buckets only.
  fy_end_month  smallint,                        -- 1-12; distinguishes a 30-Sep FY from a 31-Dec FY of the same fy_year. FY buckets only.
  period_start  date NOT NULL,                   -- inclusive roll-up window start
  period_end    date NOT NULL,                   -- inclusive roll-up window end (the FY-end date for FY buckets)
  label         varchar(32) NOT NULL,            -- "FY2024", "2024-03"
  CONSTRAINT chk_period_kind CHECK (kind IN ('financial_year', 'month', 'quarter')),
  CONSTRAINT chk_period_fy_end_month CHECK (fy_end_month IS NULL OR fy_end_month BETWEEN 1 AND 12),
  -- An FY bucket is uniquely identified by (fy_year, fy_end_month): two utilities' "FY2024" with the
  -- same FY-end share ONE row; different FY-ends are different windows/rows. (month/quarter get their
  -- own uniqueness when activated.)
  CONSTRAINT uniq_period_fy UNIQUE (kind, fy_year, fy_end_month)
);

COMMIT;

-- Verify:
--   SELECT id, name, fye_month, fye_day FROM organisations WHERE id IN (46,51,52);  -- all 12/31
--   SELECT to_regclass('public.period');                                            -- non-null, 0 rows
