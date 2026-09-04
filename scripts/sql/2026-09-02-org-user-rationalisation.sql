-- Organisation + user rationalisation (Eugene-directed, 2026-09-02).
-- Source of truth: rationalised_orgs - 20260902.xlsx + rationalised_users 20260902.xlsx,
-- with ONE Eugene override applied here: KEEP org 46 (Vanuatu Utilities) — the re-issued
-- orgs file dropped it, but Eugene confirmed retain.
--
-- Three parts, atomic:
--   1. RENAME 12 orgs — person-row ids repurposed to their proper institution.
--   2. REASSIGN 9 users — organisation_id ONLY (user.id is TEXT/better-auth; never cast).
--   3. DELETE 10 leftover empty person-org rows — SELF-GUARDED: aborts if ANY inbound FK
--      row exists on any of the 19 organisation-referencing FK columns (per #10). All 10
--      have 0 data; users are moved off in part 2 first.
--
-- bm_participates is NOT set here (that column lands via #3's #233; values set in a follow-up).
-- Single p2 instance — applying IS applying to prod. Apply runner takes organisations+user
-- backups first. git-first: merged before apply.

BEGIN;

-- 1. RENAMES (person-row → institution; id kept)
UPDATE organisations SET acronym='CRISIL', name='Crisil Consulting' WHERE id=30;
UPDATE organisations SET acronym='ADB', name='Asian Development Bank' WHERE id=33;
UPDATE organisations SET acronym='JEPIC', name='Japan Electric Power Information Center, Inc' WHERE id=36;
UPDATE organisations SET acronym='EP', name='Energy Pool' WHERE id=37;
UPDATE organisations SET acronym='GSES', name='Global Sustainable Energy Solutions' WHERE id=38;
UPDATE organisations SET acronym='ENTURA', name='Entura' WHERE id=42;
UPDATE organisations SET acronym='PRIF', name='Pacific Regional Infrastructure Facility' WHERE id=43;
UPDATE organisations SET acronym='ITPR', name='ITP Renewables' WHERE id=47;
UPDATE organisations SET acronym='A', name='Org to be clarified 1' WHERE id=49;
UPDATE organisations SET acronym='SPC', name='South Pacific Community' WHERE id=50;
UPDATE organisations SET acronym='C', name='Org to be clarified 2' WHERE id=53;
UPDATE organisations SET acronym='ANU', name='Australian National University' WHERE id=54;

-- 2. USER REASSIGNMENTS (organisation_id only; user.id is TEXT)
UPDATE "user" SET organisation_id=18 WHERE id='130';
UPDATE "user" SET organisation_id=31 WHERE id='137';
UPDATE "user" SET organisation_id=31 WHERE id='136';
UPDATE "user" SET organisation_id=33 WHERE id='122';
UPDATE "user" SET organisation_id=33 WHERE id='131';
UPDATE "user" SET organisation_id=33 WHERE id='141';
UPDATE "user" SET organisation_id=33 WHERE id='129';
UPDATE "user" SET organisation_id=50 WHERE id='154';
UPDATE "user" SET organisation_id=53 WHERE id='149';

-- 3. GUARDED DELETE of the 10 empty person-org rows (46 kept)
DO $$
DECLARE del int[] := ARRAY[32,39,40,55,41,44,45,34,35,48]; blockers text;
BEGIN
  SELECT string_agg(t || '=' || c, ', ') INTO blockers FROM (
    SELECT 'user' t, count(*) c FROM "user" WHERE organisation_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'data_entries', count(*) FROM data_entries WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'report_periods', count(*) FROM report_periods WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'service_areas', count(*) FROM service_areas WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'units', count(*) FROM units WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'power_stations', count(*) FROM power_stations WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'kpi_actual.utility_id', count(*) FROM kpi_actual WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'kpi_actual.owning_org_id', count(*) FROM kpi_actual WHERE owning_org_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'kpi_definitions', count(*) FROM kpi_definitions WHERE owner_utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'email_schedules', count(*) FROM email_schedules WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'benchmarking_request.req', count(*) FROM benchmarking_request WHERE requesting_utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'benchmarking_request.bm', count(*) FROM benchmarking_request WHERE benchmark_utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc', count(*) FROM bsc WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc_initiative', count(*) FROM bsc_initiative WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc_kpi_link', count(*) FROM bsc_kpi_link WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc_kpi_target_plan', count(*) FROM bsc_kpi_target_plan WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc_objective_link', count(*) FROM bsc_objective_link WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc_specific_objective', count(*) FROM bsc_specific_objective WHERE utility_id = ANY(del) HAVING count(*)>0
    UNION ALL SELECT 'bsc_utility_node', count(*) FROM bsc_utility_node WHERE utility_id = ANY(del) HAVING count(*)>0
  ) x;
  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT org delete — inbound FK rows present: %', blockers;
  END IF;
  DELETE FROM organisations WHERE id = ANY(del);
  RAISE NOTICE 'Deleted % empty person-org rows: %', array_length(del,1), del;
END $$;

COMMIT;

-- Verify: 44 orgs remain; the 10 gone; renames applied.
--   SELECT count(*) FROM organisations;  -- expect 44
--   SELECT id,acronym,name FROM organisations WHERE id IN (30,33,36,37,38,42,43,47,49,50,53,54) ORDER BY id;
