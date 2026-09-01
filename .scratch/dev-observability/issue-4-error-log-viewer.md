# Issue 4 — Error Log Viewer

## What to build

A `/settings/logs/errors` page giving DEV users a filterable history of all system errors logged to the `error_logs` table. The page includes a summary stats bar (count by severity over the selected time range), a top-errors breakdown (most frequent messages), and a filterable table with severity badges, timestamps, source, type, message preview, and affected user.

Each row expands inline to show the full stack trace and context JSON. A "Mark resolved" action updates a `resolved_at` column (or soft-deletes) to clear acknowledged errors from the default view.

An API endpoint `GET /api/logs/errors` supports query params: `severity`, `source`, `errorType`, `from`, `to`, `limit`, `offset`, `includeResolved`. Returns the list plus aggregate counts.

## Acceptance criteria

- [ ] `GET /api/logs/errors` returns `{ errors: [...], stats: { total, bySeverity: {...}, topMessages: [...] } }`
- [ ] Query params work: `severity=critical&source=server&from=2026-06-01&to=2026-06-24&limit=50`
- [ ] `/settings/logs/errors` page has a date range picker, severity multi-select, source dropdown, and search input
- [ ] Stats bar shows error count by severity as colored pills
- [ ] Table columns: timestamp, severity badge, source badge, error type, message (truncated), user email, expand button
- [ ] Expanded row shows full stack trace in a `<pre>` block and context as formatted JSON
- [ ] "Mark resolved" button updates the record; resolved errors hidden by default (toggleable)
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed error_logs rows, query endpoint with filters, verify results

## Blocked by

None — error_logs table already exists and is populated by `lib/error-log.service.ts` and `POST /api/logs/error`
