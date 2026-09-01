# Issue 6 — AI Usage & Cost Dashboard

## What to build

A `/settings/ai/usage` page giving DEV users full visibility into AI consumption across all users. The page has two tabs:

**Overview tab:** Aggregate ECharts line charts for daily request volume, token usage (input vs output stacked), and estimated cost. Time range selector (7d / 30d / 90d). Summary cards for today's totals.

**Per-User tab:** Sortable table showing each user's requests, tokens (in/out), estimated cost, tool calls, errors, and fallback rate over the selected period. Click a user row to see their individual trend chart. Inline cost budget editor per user (update `daily_limit_cents` in `ai_cost_budget`).

**Tool Analytics section:** Bar chart of top 15 tools by call count, table of tools with highest error rates.

**Model Health section:** Sonnet vs Haiku usage split (pie), average latency trend (line), fallback rate trend (line).

API endpoints aggregate data from `ai_usage_metrics`, `ai_chat_turn`, `ai_tool_call`, `ai_feedback`, `ai_cost_budget`.

## Acceptance criteria

- [ ] `GET /api/ai/usage/overview?days=30` returns `{ daily: [{ date, requests, tokensIn, tokensOut, costCents, toolCalls, errors }], totals: {...} }`
- [ ] `GET /api/ai/usage/per-user?days=30` returns `[{ userId, email, name, requests, tokensIn, tokensOut, costCents, toolCalls, errors, fallbackRate }]` sorted by cost descending
- [ ] `GET /api/ai/usage/tool-analytics?days=30` returns `[{ toolName, callCount, errorCount, avgLatencyMs }]`
- [ ] `GET /api/ai/usage/model-health?days=30` returns `{ sonnetCount, haikuCount, fallbackRate, avgLatencyMs }`
- [ ] Overview page renders ECharts line charts for volume, tokens, cost with time range selector
- [ ] Per-user table is sortable by any column, with inline budget editor (number input + save)
- [ ] Tool analytics shows top-15 bar chart and error-rate table
- [ ] Model health shows pie chart (Sonnet/Haiku split), latency line chart, fallback rate trend
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed usage data, query overview endpoint, verify aggregation

## Blocked by

None — all AI tracking tables (`ai_usage_metrics`, `ai_chat_turn`, `ai_tool_call`, `ai_feedback`, `ai_cost_budget`) already exist and are actively populated
