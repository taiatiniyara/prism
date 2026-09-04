-- FY-end reconciliation (Eugene-directed, 2026-08-30). Fixes the FY-end data flagged as
-- "all financial_year_end values carry year 2024; report_date actually marks the FY-end".
--
-- Depends on: 2026-08-30-organisation-fye-columns.sql (adds organisations.fye_month/fye_day).
-- Applied + verified on dev 2026-08-30. Per-env at cutover. Backup first:
--   CREATE TABLE backup.report_periods_pre_fye_<yyyymmdd> AS TABLE report_periods;
--   CREATE TABLE backup.organisations_pre_fye_<yyyymmdd>  AS TABLE organisations;
--
-- Model: fye_month/fye_day = the canonical per-utility FY-end (set at onboarding). Each FY period's
-- report_date IS its FY-end, so we align report_date's month/day to the utility's FYE. Eugene's
-- 3 conflict rulings: PNG Power = 31 Dec (was "30 Dec" typo), Wallis & Futuna = 31 Jan (report_dates
-- said Jun-30 — wrong), Guam Power = 30 Sep (report_dates split Jun-30/Sep-29, text said 31 Dec).

BEGIN;

-- 1. Sync the two stale text FYEs to Eugene's rulings BEFORE deriving the numeric columns from them.
UPDATE organisations SET financial_year_end = '30 Sep 2024' WHERE id = 11;  -- Guam Power
UPDATE organisations SET financial_year_end = '31 Dec 2024' WHERE id = 20;  -- PNG Power
-- (Wallis & Futuna id 8 keeps '31 Jan 2024' — already Eugene's ruling.)

-- 2. Backfill the canonical numeric FYE from the (now-correct) text field. Placeholder / onboarding-
--    pending utilities with NULL text stay NULL (declared at onboarding; helper falls back to report_date).
UPDATE organisations
SET fye_month = EXTRACT(MONTH FROM to_date(financial_year_end, 'DD Mon YYYY'))::smallint,
    fye_day   = EXTRACT(DAY   FROM to_date(financial_year_end, 'DD Mon YYYY'))::smallint
WHERE is_utility = true AND financial_year_end IS NOT NULL;

-- 3. Drop EMPTY FY periods that would collide with another period of the same utility on the aligned
--    date (stray placeholders / off-month duplicates). Only 0-shell periods are dropped; the period
--    carrying data (or the lower id when both empty) is kept. Verified 0-data-collisions on dev.
DELETE FROM report_periods rp
USING organisations o, managed_list_items rt
WHERE o.id = rp.utility_id AND o.fye_month IS NOT NULL
  AND rt.id = rp.report_type_id AND rt.name = 'Financial Year'
  AND (SELECT count(*) FROM data_entries de WHERE de.report_period_id = rp.id) = 0
  AND EXISTS (
    SELECT 1 FROM report_periods rp2 JOIN organisations o2 ON o2.id = rp2.utility_id
    WHERE rp2.utility_id = rp.utility_id AND rp2.id <> rp.id
      AND make_date(EXTRACT(YEAR FROM rp2.report_date)::int, o2.fye_month, o2.fye_day)
        = make_date(EXTRACT(YEAR FROM rp.report_date)::int, o.fye_month, o.fye_day)
      AND ((SELECT count(*) FROM data_entries d2 WHERE d2.report_period_id = rp2.id) > 0 OR rp2.id < rp.id)
  );

-- 4. Rewrite each FY period's report_date so its month/day matches the utility's canonical FYE
--    (year preserved). Data stays attached — only the date label changes.
UPDATE report_periods rp
SET report_date = make_date(EXTRACT(YEAR FROM rp.report_date)::int, o.fye_month, o.fye_day),
    updated_at = now()
FROM organisations o, managed_list_items rt
WHERE o.id = rp.utility_id AND o.fye_month IS NOT NULL
  AND rt.id = rp.report_type_id AND rt.name = 'Financial Year'
  AND rp.report_date::date <> make_date(EXTRACT(YEAR FROM rp.report_date)::int, o.fye_month, o.fye_day);

COMMIT;

-- Verify (all expect 0 / consistent):
--   SELECT count(*) FROM report_periods rp JOIN organisations o ON o.id=rp.utility_id
--     JOIN managed_list_items rt ON rt.id=rp.report_type_id AND rt.name='Financial Year'
--     WHERE o.fye_month IS NOT NULL AND to_char(rp.report_date,'MM-DD')<>to_char(make_date(2000,o.fye_month,o.fye_day),'MM-DD');
--   -- no duplicate (utility, report_date) FY periods.
--
-- REMAINING (separate follow-up, not this script): repoint fiscalYearForReportPeriod + dimUtilities
-- to read fye_month/fye_day instead of parsing financial_year_end, then DROP the financial_year_end column.
