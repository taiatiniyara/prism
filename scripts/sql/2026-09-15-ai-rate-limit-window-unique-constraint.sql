-- ai_rate_limit_window: add a unique constraint on (user_id, window_type, window_start)
-- so upsertRateLimitWindow (lib/ai/rate-limit.ts) can use a single atomic
-- INSERT ... ON CONFLICT DO UPDATE instead of a session-level advisory lock, which
-- doesn't serialize requests that land on different pooled connections.
--
-- The old code could race and leave duplicate rows for the same window, which would
-- violate the new constraint, so duplicates are collapsed first (summed counts, latest
-- updated_at kept) before the constraint is added.
--
-- Paired with the Drizzle schema change: db/schema/ai.ts (index replaced with
-- unique("ai_rate_limit_window_user_type_start_unique")).

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, window_type, window_start
      ORDER BY updated_at DESC, id DESC
    ) AS rn,
    sum(request_count) OVER (PARTITION BY user_id, window_type, window_start) AS total_count
  FROM ai_rate_limit_window
)
UPDATE ai_rate_limit_window w
SET request_count = ranked.total_count
FROM ranked
WHERE w.id = ranked.id AND ranked.rn = 1;

DELETE FROM ai_rate_limit_window w
USING (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, window_type, window_start
    ORDER BY updated_at DESC, id DESC
  ) AS rn
  FROM ai_rate_limit_window
) ranked
WHERE w.id = ranked.id AND ranked.rn > 1;

ALTER TABLE ai_rate_limit_window
  ADD CONSTRAINT ai_rate_limit_window_user_type_start_unique
  UNIQUE (user_id, window_type, window_start);

COMMIT;
