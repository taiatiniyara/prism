-- Not-currently-collected measures → is_active=false so the shell/relevance generator
-- excludes them (the is_active gate). Per Eugene 2026-08-25.
--
-- Downtime EVENTS (count) measures — created for possible future use; only Downtime
-- HOURS (331/333 equipment, 341/343 network) are collected:
--   330 Equipment Planned Downtime Events   (already inactive)
--   332 Equipment Unplanned Downtime Events (already inactive)
-- ⚠ 340/342 (Network Planned/Unplanned Downtime Events) REMOVED from this script —
--   Eugene REVERSED their deactivation 2026-08-26: they are REACTIVATED and their data
--   migrated to p2 where available. See 2026-08-26-reactivate-network-downtime-events.sql.
--   Equipment events 330/332 STAY OFF (Eugene explicitly narrowed the reversal to network).
-- Electricity Sent to Grid — a transmission-network-only measure, not currently
-- collected (if reactivated later it should be context-gated to utilities with a
-- transmission network, not collected from everyone):
--   440 Electricity Sent to Grid  (KEEP deactivated per Eugene 2026-08-26; reactivate on sponsor demand)
-- Applied to dev 2026-08-25 (originally incl. 340/342; reverted for those on 2026-08-26).
-- Run per environment. Idempotent.

UPDATE measure_definitions
  SET is_active = false
  WHERE id IN (330, 332, 440) AND is_active = true;
