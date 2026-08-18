-- Give country_context an annual time dimension so it can hold, e.g., Population
-- FY2023 vs FY2024 as distinct BMO-maintained figures (a time series), instead of
-- one overwrite-on-update value per country×metric. Provenance stays native on the
-- table (source_date/doc/url). Reads join to a submission by (country_id, fiscal
-- year), using the most recent period_year <= it (carry-forward as a read rule).
-- Applied to dev 2026-08-18 (table empty). Run per environment.
ALTER TABLE country_context
  ADD COLUMN IF NOT EXISTS period_year integer NOT NULL;

ALTER TABLE country_context
  ADD CONSTRAINT uq_country_context_metric_year
  UNIQUE (country_id, dl_def_id, period_year);
