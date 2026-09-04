-- Rename two IATA Air Connectivity context measures (Eugene-directed, 2026-09-01).
-- Prepends "IATA " so the family reads consistently with measure 12 "IATA Air Connectivity Score".
--   id 13: "Air Connectivity per 1000 People" -> "IATA Air Connectivity per 1000 People"
--   id 14: "Air Connectivity per Unit GDP"    -> "IATA Air Connectivity per Unit GDP"
--
-- Both are measures_subgroup_id 221 (Country Context), is_context_fed, 0 data_entries. Values live
-- in country_context keyed by measure_def_id (id-based, unaffected by the rename).
--
-- COORDINATED CODE (same PR — must land in git BEFORE this runs, per git-first):
--   - app/api/factAirConnectivity/route.ts       (name-string match on the resolved ctx row)
--   - scripts/map-country-context-defs.ts         (training-id -> prism name seed)
--   - scripts/rebuild-dl-def-mappings.ts          (destructive rebuild, matches measures by name)
-- Renaming without those makes the fact route return null and a mapping rebuild drop these two.
--
-- Idempotent: the WHERE guards the OLD name, so a re-run is a no-op once applied. Per-env (dev, then
-- prod at cutover). Backup first:
--   CREATE TABLE backup.measure_definitions_pre_iata_rename_20260901 AS
--     SELECT * FROM measure_definitions WHERE id IN (13,14);

BEGIN;

UPDATE measure_definitions
SET name = 'IATA Air Connectivity per 1000 People'
WHERE id = 13 AND name = 'Air Connectivity per 1000 People';

UPDATE measure_definitions
SET name = 'IATA Air Connectivity per Unit GDP'
WHERE id = 14 AND name = 'Air Connectivity per Unit GDP';

COMMIT;

-- Verify (expect the two IATA-prefixed names):
--   SELECT id, name FROM measure_definitions WHERE id IN (13,14) ORDER BY id;
