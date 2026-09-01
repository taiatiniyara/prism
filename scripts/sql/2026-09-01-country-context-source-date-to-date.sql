-- country_context.source_date: timestamp -> date (Eugene-directed, 2026-09-01).
--
-- source_date is provenance — the date of the BMO-cited source figure/document. No time-of-day is
-- meaningful: the UI uses a date picker, the import template documents it as a date, the seeder parses
-- it as a date, and NO code reads the time component. The stray non-midnight times on dev (12:00 on
-- 357 rows, 11:00 on 8) are date-parse / timezone artifacts, not data.
--
-- Lossless for the DATE: verified 0 rows change date under ::date (timestamp-without-tz truncation
-- takes the stored date part; every stray time is 00:00/11:00/12:00, none near a day boundary).
--
-- Paired with the Drizzle schema change: db/schema/country.ts source_date -> date(..., {mode:"date"})
-- (keeps the JS Date shape for callers). updated_date stays a timestamp (audit "last modified").
--
-- git-first: schema + this script merged to main BEFORE running. Per-env (dev now, prod at cutover).
-- Backup first: CREATE TABLE backup.country_context_pre_srcdate_20260901 AS TABLE country_context;

ALTER TABLE country_context
  ALTER COLUMN source_date TYPE date USING source_date::date;

-- Verify (expect 'date'):
--   SELECT data_type FROM information_schema.columns
--   WHERE table_name = 'country_context' AND column_name = 'source_date';
