-- Canonical per-utility financial-year-end declaration on organisations, set at onboarding.
-- Replaces the fragile text `financial_year_end` ("DD Mon 2024") with two numeric columns the
-- fiscal-year helper (fiscalYearForReportPeriod) reads directly. NULL → helper falls back to
-- report_date. Eugene-approved 2026-08-30 (design); columns owned by #4, backfill + old-column
-- retirement + helper rewrite owned by #2.
--
-- Additive + nullable → zero risk to existing rows. Applied to dev 2026-08-30. Run per environment.
-- Idempotent. Constraint names match the Drizzle schema (db/schema/utility.ts).

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS fye_month smallint;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS fye_day smallint;

ALTER TABLE organisations DROP CONSTRAINT IF EXISTS chk_org_fye_month;
ALTER TABLE organisations
  ADD CONSTRAINT chk_org_fye_month CHECK (fye_month IS NULL OR fye_month BETWEEN 1 AND 12);

ALTER TABLE organisations DROP CONSTRAINT IF EXISTS chk_org_fye_day;
ALTER TABLE organisations
  ADD CONSTRAINT chk_org_fye_day CHECK (fye_day IS NULL OR fye_day BETWEEN 1 AND 31);
