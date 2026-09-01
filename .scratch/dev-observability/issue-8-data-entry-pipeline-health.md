# Issue 8 — Data Entry Pipeline Health

## What to build

A `/settings/data-pipeline` page showing the health of the core data entry workflow across all utilities. The page displays per-utility cards with: total entries, counts at each status (Requested → Pending → Entered → Reviewed → Approved → Endorsed, plus Not Available), completion percentage for the current report period, and a count of "stuck" entries — items sitting at one status beyond a configurable threshold (default 30 days).

A drill-down expands a utility card into a table of stuck entries with: input definition name, current status, days at status, last updated by, service area, and report period. A "Nudge" button sends an email reminder to the responsible data entry officer (deferred to Issue 14 — for now, shows the contact email).

Validation failure rate is shown as a percentage: entries that failed validation on first submission vs. total submissions over the period.

An API endpoint `GET /api/data-pipeline/stats?utility_id=&period_id=` returns the aggregated data.

## Acceptance criteria

- [ ] `GET /api/data-pipeline/stats` returns `{ utilities: [{ utilityId, name, statusCounts: { requested, pending, entered, reviewed, approved, endorsed, notAvailable }, completionPct, stuckCount, validationFailRate }], stuckEntries: [...] }`
- [ ] Status counts are scoped to the current (or specified) report period
- [ ] Stuck threshold is configurable via env var `PIPELINE_STUCK_DAYS` (default 30)
- [ ] `/settings/data-pipeline` page shows utility cards with status breakdown as a horizontal stacked bar
- [ ] Stuck entries table shows input name, status, days stuck, last editor, service area, report period
- [ ] Completion % shown as a progress bar per utility
- [ ] Validation fail rate shown as a percentage badge
- [ ] Utility filter dropdown to scope to one utility
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed data entries at various statuses, verify stats query

## Blocked by

None — `data_entry` table and status workflow already exist
