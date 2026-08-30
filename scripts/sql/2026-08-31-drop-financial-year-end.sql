-- Retire the deprecated organisations.financial_year_end text field.
-- Prerequisite: fiscalYearForReportPeriod + dimUtilities now read organisations.fye_month/fye_day
-- (repoint PR), and 2026-08-30-fye-backfill-and-align.sql has populated the numeric columns.
-- Applied + verified on dev 2026-08-31. Per-env at cutover. Backup: backup.organisations_pre_fye_20260830.
ALTER TABLE organisations DROP COLUMN IF EXISTS financial_year_end;
