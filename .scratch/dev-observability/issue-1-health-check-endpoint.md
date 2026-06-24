# Issue 1 — Health Check Endpoint

## What to build

A `GET /api/health` endpoint that returns aggregate health status for every external dependency the platform relies on. Exposes existing diagnostic functions (`testPowerBiConnection()`, `getCircuitState()`) as HTTP-accessible checks. Returns a flat JSON response with per-service `ok`/`degraded`/`down` status plus latency and detail fields.

The endpoint also surfaces AI model circuit breaker state (Sonnet + Haiku), SMTP connectivity, and World Bank API reachability. Server uptime is computed from `process.uptime()`.

A minimal `/settings/overview` page renders the health response as status badges (green/yellow/red) — this page will expand with more widgets in Issue 13.

## Acceptance criteria

- [ ] `GET /api/health` returns 200 with `{ status, checks: { db, powerbi, ai_models: { sonnet, haiku }, smtp, worldbank }, uptime_seconds }`
- [ ] Each check has `{ ok, ms, message }` — `message` is empty when healthy, descriptive when unhealthy
- [ ] DB check pings PostgreSQL pool and reports latency
- [ ] Power BI check reuses `testPowerBiConnection()` — returns dataset count when healthy
- [ ] AI model check exposes `getCircuitState()` for both Sonnet and Haiku
- [ ] SMTP check attempts EHLO handshake when `SMTP_HOST` is configured; reports `unknown` when not configured
- [ ] World Bank check does a lightweight API call (e.g., country list) when configured; reports `unknown` when not
- [ ] `/settings/overview` page shows each check as a colored badge with expandable detail
- [ ] Page is gated to DEV role only via proxy middleware
- [ ] Integration test hits the endpoint and asserts structure of response

## Blocked by

None — can start immediately
