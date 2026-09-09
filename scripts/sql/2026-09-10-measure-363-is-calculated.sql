-- 2026-09-10 (#2, Eugene-directed via #1) — mark measure 363 as calculated
--
-- id 363 = "Solar Electricity Generated Theoretical" (solar_electricity_generated_theoretical_kwh).
-- Eugene is marking it is_calculated so he can build its formula next in the calculator UI.
--
-- SAFE (verified read-only before applying): 363 has 0 data_entries (nothing hidden/orphaned by
-- excluding it from manual entry) and is not used as a formula input anywhere. With no formula yet
-- the calculator simply skips it until one is built — no compute error.
--
-- Pure catalogue DATA flip (no schema/code change). git-first: script committed + merged before apply.
-- Guarded + idempotent (only flips the row if it's still false).

BEGIN;

UPDATE measure_definitions
SET is_calculated = true
WHERE id = 363
  AND is_calculated = false;   -- idempotent: no-op if already true

-- Expect: 1 row updated. Confirm:
--   SELECT id, name, is_calculated FROM measure_definitions WHERE id = 363;  -- is_calculated = true

COMMIT;
