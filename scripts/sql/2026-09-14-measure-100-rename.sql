-- 2026-09-14 (#2, Eugene-directed) — rename measure 100 (wording clarification)
--
-- id 100 governance question. Name reworded for clarity:
--   FROM: "Are line/sector Ministers or Public Servants appointed to the Board?"
--   TO:   "Are Ministers or Public Servants representing the line/sector Ministry appointed to the Board?"
--
-- Pure display-label change. Verified read-only: the old name is not a functional
-- matching key in live code (only a comment in a one-off training-fix script mentions it).
-- definition/flags untouched. git-first: committed + merged before apply.
-- Guarded (old-name predicate) + idempotent.

BEGIN;

UPDATE measure_definitions
SET name = 'Are Ministers or Public Servants representing the line/sector Ministry appointed to the Board?'
WHERE id = 100
  AND name = 'Are line/sector Ministers or Public Servants appointed to the Board?';

-- Expect: 1 row updated. Confirm:
--   SELECT id, name FROM measure_definitions WHERE id = 100;

COMMIT;
