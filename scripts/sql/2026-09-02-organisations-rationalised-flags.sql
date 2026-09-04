-- Apply the rationalised org flags from rationalised_orgs - 20260902.xlsx
-- (sheet "new_orgs"), Eugene-directed 2026-09-02, values set by #3.
--
-- (1) bm_participates: TRUE for the 20 participating utilities, FALSE for all
--     others. NOTE the authoritative list is 20 (includes id 17 NPC / Niue Power
--     Corporation) — an earlier relayed list of 19 had omitted NPC.
-- (2) is_utility: rationalised to match the sheet. Only ONE delta vs current
--     data — org id 1 "All Utilities" (the aggregate sentinel) → false; every
--     other org already matches, so no other is_utility row is touched.
--
-- Idempotent. The bm_participates column itself is added by the sibling
-- migration 2026-09-02-organisations-bm-participates.sql (PR #233).

-- (1) bm_participates
UPDATE organisations SET bm_participates = true
  WHERE id IN (2,3,4,5,7,10,13,15,16,17,19,20,21,22,23,24,25,26,27,28);
UPDATE organisations SET bm_participates = false
  WHERE id NOT IN (2,3,4,5,7,10,13,15,16,17,19,20,21,22,23,24,25,26,27,28);

-- (2) is_utility (single delta: the "All Utilities" aggregate sentinel)
UPDATE organisations SET is_utility = false WHERE id = 1;
