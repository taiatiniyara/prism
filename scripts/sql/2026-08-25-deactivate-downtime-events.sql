-- The Downtime EVENTS (count) measures are not collected inputs — they were created
-- for possible future use. Only Downtime HOURS (331/333 equipment, 341/343 network)
-- are collected. Set the four Events measures inactive so the shell/relevance generator
-- excludes them (the is_active=false gate). Per Eugene 2026-08-25.
--   330 Equipment Planned Downtime Events   (already inactive)
--   332 Equipment Unplanned Downtime Events (already inactive)
--   340 Network Planned Downtime Events
--   342 Network Unplanned Downtime Events
-- Applied to dev 2026-08-25. Run per environment. Idempotent.

UPDATE measure_definitions
  SET is_active = false
  WHERE id IN (330, 332, 340, 342) AND is_active = true;
