-- Realign identity sequences left stale by the p1 explicit-id import (Eugene domain: migration
-- hygiene; flagged by #3 after kpi_definitions hit it, fixed there in PR #312).
--
-- The p1 import inserted rows with EXPLICIT ids, so the backing identity sequences never advanced
-- and still point at 1. The next app-driven INSERT (which uses nextval, no explicit id) collides on
-- a low, already-taken id (duplicate pkey). Audit 2026-09-03 across all 43 sequence-backed public
-- tables found exactly these 5 stale (next value <= max(id)); the other 38 are healthy, and
-- kpi_definitions was already realigned by #3.
--
-- setval(seq, max(id)) => next nextval = max(id)+1, which is always free. Safe, idempotent (re-running
-- is a no-op), no data change. git-first: committed + pushed before running against p2.

SELECT setval(pg_get_serial_sequence('managed_lists',  'id'), (SELECT max(id) FROM managed_lists));
SELECT setval(pg_get_serial_sequence('report_periods', 'id'), (SELECT max(id) FROM report_periods));
SELECT setval(pg_get_serial_sequence('roles',          'id'), (SELECT max(id) FROM roles));
SELECT setval(pg_get_serial_sequence('service_areas',  'id'), (SELECT max(id) FROM service_areas));
SELECT setval(pg_get_serial_sequence('units',          'id'), (SELECT max(id) FROM units));

-- Verify (each seq_next should now be max(id)+1, i.e. > max(id)):
--   SELECT 'managed_lists' t, last_value FROM managed_lists_id_seq
--   UNION ALL SELECT 'report_periods', last_value FROM report_periods_id_seq
--   UNION ALL SELECT 'roles', last_value FROM roles_id_seq
--   UNION ALL SELECT 'service_areas', last_value FROM service_areas_id_seq
--   UNION ALL SELECT 'units', last_value FROM units_id_seq;
