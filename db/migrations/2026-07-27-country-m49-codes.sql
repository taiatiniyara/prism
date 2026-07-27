-- UN M49 reference codes on the geographic tables (stream #13).
-- Additive + non-breaking: adds nullable alternate-key columns only. The serial
-- PKs and every existing `country_id` / `sub_region_id` FK are untouched.
-- Run this, then `scripts/backfill-m49-codes.ts` to populate the codes from
-- db/seed-data/un-m49.csv (matches countries on ISO alpha-3).

ALTER TABLE "sub_regions"
  ADD COLUMN IF NOT EXISTS "m49_code" varchar(3),
  ADD COLUMN IF NOT EXISTS "un_region_m49_code" varchar(3);

ALTER TABLE "countries"
  ADD COLUMN IF NOT EXISTS "m49_code" varchar(3);

-- Unique alternate keys (a NULL is allowed pre-backfill; Postgres treats NULLs
-- as distinct, so multiple un-backfilled rows are fine).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sub_regions_m49_code_unique'
  ) THEN
    ALTER TABLE "sub_regions"
      ADD CONSTRAINT "sub_regions_m49_code_unique" UNIQUE ("m49_code");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'countries_m49_code_unique'
  ) THEN
    ALTER TABLE "countries"
      ADD CONSTRAINT "countries_m49_code_unique" UNIQUE ("m49_code");
  END IF;
END $$;
