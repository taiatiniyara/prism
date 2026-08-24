-- Not-currently-collected measures → is_active=false so the shell/relevance generator
-- excludes them (the is_active gate). Per Eugene 2026-08-25.
--
-- Downtime EVENTS (count) measures — created for possible future use; only Downtime
-- HOURS (331/333 equipment, 341/343 network) are collected:
--   330 Equipment Planned Downtime Events   (already inactive)
--   332 Equipment Unplanned Downtime Events (already inactive)
--   340 Network Planned Downtime Events
--   342 Network Unplanned Downtime Events
-- Electricity Sent to Grid — a transmission-network-only measure, not currently
-- collected (if reactivated later it should be context-gated to utilities with a
-- transmission network, not collected from everyone):
--   440 Electricity Sent to Grid
-- Applied to dev 2026-08-25. Run per environment. Idempotent.

UPDATE measure_definitions
  SET is_active = false
  WHERE id IN (330, 332, 340, 342, 440) AND is_active = true;
