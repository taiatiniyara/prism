-- ai_chat_turn: add a unique constraint on (session_id, turn_number). The API now
-- locks the session row (SELECT ... FOR UPDATE) before computing MAX(turn_number)+1
-- and inserting a turn, so a double-submit/retry on the same session can no longer
-- race two inserts onto the same turn_number. This constraint is the backstop: any
-- remaining race becomes a clean insert failure instead of two turns silently
-- sharing a turn_number (which would interleave/collide in the UI's ordering).
--
-- Duplicates from the old race are collapsed first (keep the earliest row per
-- (session_id, turn_number), renumber the rest onto the end of their session) before
-- the constraint is added.
--
-- Paired with the Drizzle schema change: db/schema/ai.ts (index replaced with
-- unique("ai_chat_turn_session_turn_unique")) and app/api/ai/chat/route.ts.

BEGIN;

WITH dupes AS (
  SELECT
    id,
    session_id,
    row_number() OVER (
      PARTITION BY session_id, turn_number
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM ai_chat_turn
),
renumbered AS (
  SELECT
    id,
    session_id,
    (SELECT COALESCE(MAX(t2.turn_number), 0) FROM ai_chat_turn t2 WHERE t2.session_id = dupes.session_id)
      + row_number() OVER (PARTITION BY session_id ORDER BY id) AS new_turn_number
  FROM dupes
  WHERE rn > 1
)
UPDATE ai_chat_turn t
SET turn_number = renumbered.new_turn_number
FROM renumbered
WHERE t.id = renumbered.id;

ALTER TABLE ai_chat_turn
  ADD CONSTRAINT ai_chat_turn_session_turn_unique
  UNIQUE (session_id, turn_number);

COMMIT;
