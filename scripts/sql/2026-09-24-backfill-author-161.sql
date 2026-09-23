-- 2026-09-24 (#2, Eugene-directed) — backfill author user 161 on Run #17 entries
--
-- In Run #17, 21 rows had extract author id 161, which wasn't a p2 user then → loaded with a
-- NULL author ("other" rejections). Eugene has since added user 161 to p2 (user.id = '161').
-- The ENTRIES are already loaded (only the author was nulled) — this attributes them to 161.
--
-- Of the 21: 2 (mig-id 7005/7010, unit 698) were re-loaded in Load #19 AFTER 161 existed, so they
-- already carry updated_by_id='161'. The remaining 19 (loaded in Run #17 before 161 existed) are
-- fixed here — matched to their rejection payloads on the FULL address (unique per uniq_entry_address),
-- guarded to only touch null-author rows. git-first; guarded; scoped to load 17's author-161 set.

BEGIN;

-- 1. Attribute the 19 null-author Run#17 rows to user 161 (full-address match to the rejection payload).
UPDATE data_entries de
SET updated_by_id = '161', updated_at = de.updated_at
FROM migration_rejections r
WHERE r.load_id = 17 AND r.failure_category = 'other'
  AND de.updated_by_id IS NULL
  AND de.report_period_id = (r.source_payload->>'reportPeriodId')::int
  AND de.measure_def_id   = (r.source_payload->>'measureId')::int
  AND de.unit_id          IS NOT DISTINCT FROM NULLIF(r.source_payload->>'unitId','')::int
  AND de.service_area_id  IS NOT DISTINCT FROM NULLIF(r.source_payload->>'serviceAreaId','')::int
  AND de.utility_id       IS NOT DISTINCT FROM NULLIF(r.source_payload->>'utilityId','')::int
  AND de.power_station_id IS NOT DISTINCT FROM NULLIF(r.source_payload->>'powerStationId','')::int
  AND de.country_id       IS NOT DISTINCT FROM NULLIF(r.source_payload->>'countryId','')::int
  AND de.provider_id         = (r.source_payload->'dims'->>'provider')::int
  AND de.category_id         = (r.source_payload->'dims'->>'type')::int
  AND de.technology_id       = (r.source_payload->'dims'->>'source')::int
  AND de.asset_class_id      = (r.source_payload->'dims'->>'resource_type')::int
  AND de.customer_type_id    = (r.source_payload->'dims'->>'customer_type')::int
  AND de.payment_mode_id     = (r.source_payload->'dims'->>'payment_mode')::int
  AND de.consumption_band_id = (r.source_payload->'dims'->>'band')::int
  AND de.division_id         = (r.source_payload->'dims'->>'division')::int
  AND de.gender_id           = (r.source_payload->'dims'->>'gender')::int
  AND de.utility_function_id = (r.source_payload->'dims'->>'utility_function')::int;
-- Expect: 19 rows.

-- 2. Fix the migrated-comment commenterId (was nulled with the author) on the rows now authored by 161.
UPDATE data_entries
SET comments = (
  SELECT jsonb_agg(
    CASE WHEN e->>'commenterRole' = 'migrated' AND (e->>'commenterId') IS NULL
         THEN jsonb_set(e, '{commenterId}', '"161"')
         ELSE e END)
  FROM jsonb_array_elements(comments::jsonb) e)::json
WHERE updated_by_id = '161'
  AND comments::jsonb @> '[{"commenterRole":"migrated","commenterId":null}]'::jsonb;

COMMIT;

-- Verify:
--   SELECT count(*) FROM data_entries de JOIN migration_rejections r
--     ON r.load_id=17 AND r.failure_category='other'
--    AND de.report_period_id=(r.source_payload->>'reportPeriodId')::int
--    AND de.measure_def_id=(r.source_payload->>'measureId')::int
--   WHERE de.updated_by_id='161';  -- expect 21 (all author-161 entries now attributed)
