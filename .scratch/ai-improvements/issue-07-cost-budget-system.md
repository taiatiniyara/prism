# Cost Budget System

## What to build

AI API calls cost money — currently there is no mechanism to cap spending per user. A buggy loop or a power user could generate hundreds of dollars in Anthropic API costs with no warning.

Add a cost budget system: a per-user daily spending cap, enforced at the API level before each AI request, with a visible warning in the chat UI when approaching the limit.

## Acceptance criteria

- [ ] DB migration adds `ai_cost_budget` table: `user_id`, `daily_limit_cents`, `notifications_enabled`, `updated_at`
- [ ] Default daily limit configurable via env var `AI_DEFAULT_DAILY_COST_LIMIT_CENTS`
- [ ] Rate limiter checks cumulative daily cost before allowing each request
- [ ] Request is blocked (429) if estimated cost would exceed remaining budget
- [ ] Chat UI shows cost bar: spent / limit with percentage (updated after each response)
- [ ] Warning banner appears at 80%: "You've used 80% of your daily AI budget ($4.00/$5.00)"
- [ ] Cost bar hidden for users with no budget configured (backward compatible)
- [ ] Admin users can set per-user limits via existing user management (or direct DB)
- [ ] Cost tracking uses the same per-model pricing already in `rate-limit.ts` (Sonnet: $3/$15, Haiku: $0.80/$4 per M tokens)

## Blocked by

None — can start immediately.
