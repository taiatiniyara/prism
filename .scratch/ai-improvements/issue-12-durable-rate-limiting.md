# Durable Rate Limiting

## What to build

The AI rate limiter uses an in-memory `Map<string, number[]>` keyed by user ID. When the server restarts (PM2 reload, deploy, crash recovery), all rate limit counters are reset to zero — a user who was rate-limited can immediately make another 100 requests.

Replace the in-memory store with a database-backed counter that survives restarts. Use PostgreSQL advisory locks to prevent race conditions on counter updates.

## Acceptance criteria

- [ ] Rate limit state persists across server restarts
- [ ] Rate limit counters use the database, not an in-memory Map
- [ ] `ai_rate_limit_windows` table: `user_id`, `window_type` (minute/15min), `window_start`, `request_count`
- [ ] Old windows pruned periodically (older than 30 minutes)
- [ ] Advisory lock (`pg_try_advisory_lock`) prevents race conditions when checking + incrementing
- [ ] 429 response still includes `Retry-After` header with correct wait time
- [ ] Performance: rate limit check adds <5ms overhead (fast path via indexed query)
- [ ] Fallback: if DB is down, fail open (allow the request) with a warning log — don't block all AI traffic
- [ ] Existing `rate-limit.ts` API preserved — `checkRateLimit()` returns same shape

## Blocked by

None — can start immediately.
