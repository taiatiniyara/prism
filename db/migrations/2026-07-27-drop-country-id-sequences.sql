-- Drop the now-unused serial id sequences on countries + sub_regions (stream #13).
--
-- Since these tables are keyed by the explicit UN M49 code (PR #60: id is integer,
-- not serial), the leftover `*_id_seq` sequences are unused — and a stale sequence
-- (last_value well below existing M49 ids) could hand out a colliding id if a row
-- were ever inserted via the old serial default. This removes the DEFAULT and the
-- sequences so ids must be supplied explicitly, matching the merged schema.
--
-- Idempotent + portable (resolves the sequence name at runtime). Already applied
-- to the dev DB 2026-07-27.

DO $$
DECLARE s text;
BEGIN
  s := pg_get_serial_sequence('countries', 'id');
  IF s IS NOT NULL THEN
    ALTER TABLE countries ALTER COLUMN id DROP DEFAULT;
    EXECUTE 'DROP SEQUENCE IF EXISTS ' || s;
  END IF;

  s := pg_get_serial_sequence('sub_regions', 'id');
  IF s IS NOT NULL THEN
    ALTER TABLE sub_regions ALTER COLUMN id DROP DEFAULT;
    EXECUTE 'DROP SEQUENCE IF EXISTS ' || s;
  END IF;
END $$;
