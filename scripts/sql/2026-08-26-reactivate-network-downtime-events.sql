-- Reactivate Network Downtime EVENTS measures 340 + 342.
-- Eugene REVERSAL 2026-08-26 (relayed via #2): network downtime-event counts are wanted after
-- all, and their historical data will be migrated to p2 where available. This reverses the
-- 2026-08-25 downtime-events deactivation FOR 340/342 ONLY.
--   340 Network Planned Downtime Events   → is_active=true
--   342 Network Unplanned Downtime Events → is_active=true
-- Scope guard (Eugene explicitly narrowed): equipment events 330/332 STAY OFF — do NOT reactivate.
--
-- effective_from is left at its baseline value (2019-12-31, the same cohort as the other
-- 2020-baseline measures) — it already covers the 2020+ periods the data spans, so no change
-- needed there; this script only flips is_active.
--
-- SEQUENCING: this reactivation is the PREREQUISITE for #2's 340/342 data load — verify-relevance
-- gates shells on is_active, so the measures must be active before the shells load. After this
-- lands, verify-relevance's generative half will EXPECT 340/342 shells and may transiently flag
-- them as "missing" until #2's data load completes — that is correct/expected, not a regression.
--
-- Applied to dev 2026-08-26. Run per environment. Idempotent.

UPDATE measure_definitions
  SET is_active = true
  WHERE id IN (340, 342) AND is_active = false;
