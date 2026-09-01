# Issue 13 — Admin Overview Dashboard

## What to build

The full `/settings/overview` page — the "single pane of glass" DEV landing page. Composes data from slices 1, 4, 6, 9, 10, and 11 into a unified dashboard. Does NOT duplicate those slices' APIs or pages — it consumes their existing endpoints and renders summary widgets.

Layout is a responsive grid of cards:

- **System Health** (from Issue 1): compact status badges for DB, Power BI, AI models, SMTP — clicking any badge navigates to full health detail
- **Error Rate Sparkline** (from Issue 4): 24h and 7d line chart of error counts by hour/day, with current count and trend arrow
- **AI Usage Today** (from Issue 6): requests count, token total, estimated cost, with a % change vs yesterday
- **KPI Calc Health** (from Issue 9): pending / failed count badges, clicking navigates to full monitor
- **Active Users** (from Issue 10): count of active sessions, plus a "new users this week" count
- **Backup Status** (from Issue 11): last backup time with relative timestamp and age-based color
- **Email Schedule Health**: last run timestamp, pending count, last send success/failure — reads from `schedule_send_logs` and `email_schedules` tables
- **Data Pipeline Snapshot** (from Issue 8): total entries vs completed %, stuck entry count

Each card is a self-contained component fetching its own data. Cards use skeleton loading states. The page auto-refreshes every 60 seconds (configurable). The overview page becomes the default redirect target when DEV users visit `/settings`.

## Acceptance criteria

- [ ] `/settings/overview` page renders a responsive grid of summary cards (2 columns desktop, 1 mobile)
- [ ] Cards fetch data from existing API endpoints from Issues 1, 4, 6, 9, 10, 11 — no new endpoints needed
- [ ] Email schedule card fetches directly from `schedule_send_logs` (small inline query acceptable)
- [ ] Each card shows: title, primary metric (large number), secondary metric (trend/detail), and a "View details" link
- [ ] Skeleton loading state while data fetches
- [ ] Error state per card (red outline + "failed to load" with retry button) — one card failing does not break others
- [ ] Auto-refresh every 60s with a manual refresh button; configurable via `OVERVIEW_REFRESH_SECONDS` env var
- [ ] DEV users redirected from `/settings` to `/settings/overview` as default landing
- [ ] Page is gated to DEV role only
- [ ] Integration test: verify page renders all card skeletons, then populates with mock API responses

## Blocked by

Issue 1 (Health Check Endpoint), Issue 4 (Error Log Viewer), Issue 6 (AI Usage Dashboard), Issue 9 (KPI Calculation Monitor), Issue 10 (Security & Auth Dashboard), Issue 11 (Backup & Data Integrity Monitor) — consumes their APIs
