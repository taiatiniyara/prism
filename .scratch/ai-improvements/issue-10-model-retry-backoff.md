# Model-Level Retry with Backoff

## What to build

When the primary model (Claude Sonnet 4.6) fails, the system immediately falls back to Haiku 4.5 with no retry attempt. Transient errors like rate limiting (429) or temporary service disruption (5xx) from Anthropic are treated the same as permanent failures — wasting the primary model's quality advantage unnecessarily.

Add exponential backoff retry for transient errors before falling back, and a model-level circuit breaker to prevent cascading retries when the API is persistently down.

## Acceptance criteria

- [ ] Transient errors (429, 502, 503, 504) retry up to 3 times with exponential backoff (1s, 2s, 4s)
- [ ] Only fall back to Haiku 4.5 after all retries are exhausted on the primary model
- [ ] Permanent errors (400, 401, 403) fail immediately without retry
- [ ] Request timeout errors retry once (not 3x — timeout usually means the request is too large, not transient)
- [ ] Model-level circuit breaker: 5 consecutive failures on either model → 30s cooldown, all requests fast-fail during cooldown
- [ ] Circuit breaker state logged and surfaced in API response headers (`X-Circuit-Breaker: open`)
- [ ] `wasFallback` flag still set correctly after retries
- [ ] Retry count and circuit breaker transitions tracked in `ai_usage_metrics`

## Blocked by

None — can start immediately.
