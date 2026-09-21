-- ai_chat_turn: persist Anthropic prompt-cache token counts per turn (#16 AI optimisation).
--
-- token_count_input is the TOTAL prompt size (uncached + cache-write + cache-read), so
-- on its own it cannot show whether prompt caching is hitting, and pricing it at the
-- base input rate overstates spend. These two columns are the split:
--   token_count_cache_read   tokens served from cache  (billed ~0.1x input)
--   token_count_cache_write  tokens written to cache   (billed 1.25x input, 5-min TTL)
-- uncached = token_count_input - cache_read - cache_write.
--
-- ADDITIVE + nullable: existing rows stay NULL ("not recorded"), old code is unaffected.
-- Apply AFTER this file is merged (git before DB) and BEFORE the paired code PR
-- (db/schema/ai.ts + app/api/ai/chat/route.ts) goes live, so the new UPDATE never
-- references a missing column.

ALTER TABLE ai_chat_turn
  ADD COLUMN IF NOT EXISTS token_count_cache_read integer,
  ADD COLUMN IF NOT EXISTS token_count_cache_write integer;
