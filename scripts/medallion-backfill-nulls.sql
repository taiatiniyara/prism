-- Medallion Phase 2a: Backfill NULL dimension columns to their "All" members
-- Run this BEFORE adding NOT NULL constraints.
-- All member IDs confirmed from legacy workbook analysis (2026-07-09).

BEGIN;

-- 1. customer_type_id: NULL → 690 (All Customers)
--    ~45,453 rows carry NULL meaning "not sliced by customer type"
UPDATE data_entries
SET customer_type_id = 690
WHERE customer_type_id IS NULL
  AND is_deleted = false;

-- 2. payment_mode_id: NULL → 720 (All Payment Modes)
--    Same 45,453 rows as above
UPDATE data_entries
SET payment_mode_id = 720
WHERE payment_mode_id IS NULL
  AND is_deleted = false;

-- 3. energy_provider_id: NULL → 20 (All Providers)
UPDATE data_entries
SET energy_provider_id = 20
WHERE energy_provider_id IS NULL
  AND is_deleted = false;

-- 4. energy_source_id: NULL → 40 (All GEN sources)
UPDATE data_entries
SET energy_source_id = 40
WHERE energy_source_id IS NULL
  AND is_deleted = false;

-- 5. energy_type_id: NULL → 30 (All Energy Types) — new column
UPDATE data_entries
SET energy_type_id = 30
WHERE energy_type_id IS NULL
  AND is_deleted = false;

-- 6. consumption_band_id: NULL → find or create All member
--    The Consumption Band "All" member must exist before running this.
--    Once it exists, set its ID here.
-- UPDATE data_entries
-- SET consumption_band_id = <ALL_CONSUMPTION_BAND_ID>
-- WHERE consumption_band_id IS NULL AND is_deleted = false;

-- 7. division_id: NULL → find or create All member
-- UPDATE data_entries
-- SET division_id = <ALL_DIVISION_ID>
-- WHERE division_id IS NULL AND is_deleted = false;

-- 8. gender_id: NULL → find or create All member
-- UPDATE data_entries
-- SET gender_id = <ALL_GENDER_ID>
-- WHERE gender_id IS NULL AND is_deleted = false;

-- Verify backfill counts
SELECT
  COUNT(*) FILTER (WHERE energy_provider_id IS NULL) AS null_providers,
  COUNT(*) FILTER (WHERE energy_type_id IS NULL) AS null_types,
  COUNT(*) FILTER (WHERE energy_source_id IS NULL) AS null_sources,
  COUNT(*) FILTER (WHERE customer_type_id IS NULL) AS null_customers,
  COUNT(*) FILTER (WHERE payment_mode_id IS NULL) AS null_payments,
  COUNT(*) FILTER (WHERE consumption_band_id IS NULL) AS null_bands,
  COUNT(*) FILTER (WHERE division_id IS NULL) AS null_divisions,
  COUNT(*) FILTER (WHERE gender_id IS NULL) AS null_genders
FROM data_entries
WHERE is_deleted = false;

COMMIT;
