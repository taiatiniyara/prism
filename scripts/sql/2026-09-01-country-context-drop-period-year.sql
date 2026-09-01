-- country_context: drop period_year; rekey on (country_id, measure_def_id, source_date).
-- 2026-09-01 (Eugene-directed). The time-series key is now source_date — the date of the
-- BMO-cited source figure. Reads (getResolvedContextRows) carry forward the latest
-- source_date STRICTLY BEFORE a report period's report_date (as-of rule), replacing the
-- old period_year <= fiscal-year carry-forward. period_year is dropped; source_date becomes
-- NOT NULL.
--
-- The table is TRUNCATED first: the seeded rows cannot be rekeyed onto source_date
-- losslessly — their source_dates are load timestamps (not true source dates), 10 Fiji
-- (country 520) groups share one source_date across 5 year-rows, and 31 rows have NULL
-- source_date. The BMO reloads real figures (see seed-country-context.ts).
--
-- Paired with the Drizzle schema change: db/schema/country.ts (period_year removed,
-- source_date NOT NULL, unique uq_country_context_metric_source).

BEGIN;

TRUNCATE TABLE country_context;

ALTER TABLE country_context DROP CONSTRAINT IF EXISTS uq_country_context_metric_year;
ALTER TABLE country_context DROP COLUMN IF EXISTS period_year;

ALTER TABLE country_context ADD CONSTRAINT uq_country_context_metric_source
  UNIQUE (country_id, measure_def_id, source_date);
ALTER TABLE country_context ALTER COLUMN source_date SET NOT NULL;

COMMIT;