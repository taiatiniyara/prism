# Issue 7 — Cost & Budget Monitor

## What to build

A `/settings/costs` page extending the AI usage data with a financial lens. Shows total Anthropic spend trends (daily, weekly, monthly) against configurable budget thresholds. Breaks down cost by utility — attributing AI spend to the organisations whose users are making the requests.

Anomaly detection highlights days where spend is 2x or more above the 7-day rolling average, with a red badge on the trend chart. Budget alerts: when daily spend exceeds a configurable threshold, the page shows a warning indicator and (once Issue 14 is built) triggers a notification.

An API endpoint `GET /api/costs/overview?days=30` returns total spend, per-utility attribution, anomaly flags, and budget vs actual comparison. Reuses the aggregate queries from Issue 6 where possible.

## Acceptance criteria

- [ ] `GET /api/costs/overview?days=30` returns `{ totalSpendCents, daily: [...], byUtility: [{ utilityId, name, spendCents, requestCount }], anomalies: [{ date, spendCents, avg7dCents, ratio }], budget: { dailyLimitCents, daysOverBudget } }`
- [ ] Per-utility attribution joins `ai_chat_turn` or `ai_usage_metrics` through user → organisation
- [ ] Anomaly detection flags days where `spend > 2 * avgSpendLast7Days`
- [ ] `/settings/costs` page has: total spend card, spend trend ECharts line chart with anomaly markers, per-utility bar chart
- [ ] Budget section shows daily limit, current day spend, and over-budget warning when exceeded
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed usage across two utilities, verify attribution and anomaly detection

## Blocked by

Issue 6 (AI Usage Dashboard) — shares aggregate data endpoints and query patterns
