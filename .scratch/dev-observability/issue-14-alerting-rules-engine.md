# Issue 14 — Alerting Rules Engine

## What to build

A configurable alerting system that lets each DEV user control what notifications they receive and under what conditions. Replaces the current hardcoded "email all DEV users on every error" behavior with per-user preferences and threshold-based rules.

**Schema:** New `alert_rules` table: `id, user_id (DEV only), category (error/cost/powerbi/security/backup), severity_filter (error/warning/critical — for error category), threshold (JSONB, e.g., {"errorRatePerHour": 50, "dailyCostCents": 300}), cooldown_minutes, enabled, created_at, updated_at`. New `alert_history` table: `id, rule_id, triggered_at, message, dispatched (boolean)`.

**Service:** `lib/alerting.service.ts` evaluates rules when events occur (error logged, cost budget hit, Power BI degraded, backup missed, security spike). Checks cooldown to avoid spam. Dispatches via email (reusing existing email infrastructure) AND writes to in-app notification store.

**In-app notifications:** A bell icon in the app header (visible to DEV only) showing unread count badge. Clicking opens a dropdown with recent notifications (last 50). Clicking a notification marks it read and navigates to the relevant page (`/settings/logs/errors`, `/settings/costs`, etc.). Notifications stored in a `notifications` table: `id, user_id, category, title, message, read, link, created_at`.

**Settings page:** `/settings/alerts` lets each DEV user: enable/disable alert categories, set threshold values (error rate per hour, daily cost limit, backup age hours), set cooldown (prevent same alert within N minutes), see recent alert history.

## Acceptance criteria

- [ ] `alert_rules` table with per-user configurable rules
- [ ] `alert_history` table tracking triggered alerts
- [ ] `notifications` table for in-app notification bell
- [ ] `lib/alerting.service.ts`: `evaluateRule(category, data)` checks thresholds, cooldown, dispatches
- [ ] `logErrorAndNotifyDev()` refactored to go through alerting service instead of hardcoded email-all
- [ ] Cost monitoring (from Issue 7) triggers alert on daily budget exceed
- [ ] Health check degradation (from Issue 1) triggers alert on any service going `down`
- [ ] Security spike detection (from Issue 10) triggers alert on failed login spike
- [ ] Backup age (from Issue 11) triggers alert when last backup > threshold hours
- [ ] Notification bell component in app header: unread badge, dropdown with last 50 notifications
- [ ] `/settings/alerts` page: per-category enable/disable toggles, threshold inputs, cooldown config, recent alert history table
- [ ] Cooldown enforced: same rule won't trigger again within `cooldown_minutes`
- [ ] Bell and alerts page gated to DEV role only
- [ ] Integration test: create rule, trigger event, verify notification created and cooldown respected

## Blocked by

Issue 4 (Error Log Viewer) — for error rate alerts
Issue 7 (Cost & Budget Monitor) — for cost threshold alerts
Issue 10 (Security & Auth Dashboard) — for security spike alerts
Issue 1 (Health Check Endpoint) — for service degradation alerts
Issue 11 (Backup & Data Integrity Monitor) — for backup age alerts
