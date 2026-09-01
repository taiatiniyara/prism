-- "Hours in Period" (measure_definitions.name = 'Hours in Period') is computed by
-- lib/period-hours.ts, not manually entered — so it must be flagged system-generated
-- (otherwise it's requested as a manual input / shows as a gap). Data change, not
-- schema, so deploys don't carry it: run against every environment (applied to dev
-- 2026-08-13). Idempotent.
UPDATE measure_definitions
SET    is_system_generated = true, updated_at = now()
WHERE  name = 'Hours in Period'
  AND  is_system_generated = false;
