-- 2026-09-24 (#2) — realign units_id_seq after explicit-id inserts of units 698/699
--
-- The dev added units 698 & 699 with explicit ids (to fix the Run #17 unit-FK gap), but
-- units_id_seq was left at 697 (last_value=697, is_called=true → next nextval = 698), which
-- would COLLIDE with the existing unit 698 on the next app INSERT. Realign to max(id).
-- (data_entries.id is uuid → no realignment; report_periods seq 413 > 268 → fine. Only units.)
-- Idempotent (setval to current max). See memory: realign-sequences-after-explicit-id-import.

SELECT setval(
  pg_get_serial_sequence('units', 'id'),
  (SELECT max(id) FROM units)
);
-- After: last_value = 699, is_called = true → next app INSERT gets 700 (no collision).

-- Verify:
--   SELECT (SELECT max(id) FROM units) AS maxid, last_value, is_called FROM units_id_seq;
