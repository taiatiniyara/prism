-- Backfill the missing EMPTY shells for the two calculated measures the p1 extract
-- omitted: 230 Total Costs, 231 Profit. The p2 calculator FILLS pre-existing calculated
-- shells (it does not upsert-create them — per #3, §2/§12: the shells are the relevance
-- balance + the engine's work-list). With zero shells, their formulas would be skipped.
--
-- These are utility-level Financial Accounts measures at the identical grain/address as
-- their 22 siblings (Revenue 200, Cost of Sales 210, …), which each have exactly 77
-- shells (1 per utility-period). So we CLONE the address of Revenue (200) per utility-
-- period and swap in measure_def_id 230/231, with NO value and status Pending(2) — a
-- genuine empty shell for the engine to compute into. Cloning guarantees the 10-dim +
-- grain address matches the uniq_entry_address convention exactly.
--
-- NOTE (Eugene 2026-08-25): calculated shells (is_calculated=true) are engine-filled, so
-- they must be EXCLUDED from the utility-facing "shells requested / to answer" count and
-- the utility's completeness obligation — they count in the relevance balance as a
-- separate calc bucket, never as utility work. (Captured also in the relevance spec.)
--
-- Creates 77 x 2 = 154 rows. Applied to dev 2026-08-25. Run per environment. Idempotent.

INSERT INTO data_entries (
  id, report_period_id, measure_def_id, status_id, is_relevant, is_deleted,
  provider_id, technology_id, customer_type_id, payment_mode_id,
  utility_id, category_id, consumption_band_id, division_id, gender_id,
  asset_class_id, utility_function_id, unit_id, service_area_id, power_station_id,
  country_id, subregion_id, region, updated_at
)
SELECT
  gen_random_uuid(), src.report_period_id, tgt.mid, 2 /*Pending*/, true, false,
  src.provider_id, src.technology_id, src.customer_type_id, src.payment_mode_id,
  src.utility_id, src.category_id, src.consumption_band_id, src.division_id, src.gender_id,
  src.asset_class_id, src.utility_function_id, src.unit_id, src.service_area_id, src.power_station_id,
  src.country_id, src.subregion_id, src.region, now()
FROM data_entries src
CROSS JOIN (VALUES (230), (231)) AS tgt(mid)
WHERE src.measure_def_id = 200 AND src.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM data_entries d
    WHERE d.report_period_id = src.report_period_id
      AND d.measure_def_id = tgt.mid
      AND d.is_deleted = false
  );
