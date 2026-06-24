# Issue 5 — Audit Log Viewer

## What to build

A `/settings/logs/audit` page for DEV users showing a chronological feed of all security and operational audit events from the `audit_logs` table. The page includes an action-type filter (login, role_change, data_entry.*, settings.*, migration.*), a date range picker, and search by actor email or target.

Each entry shows: timestamp, action type badge, actor email, target description, details (collapsed JSON), and IP address. A CSV export button downloads the currently filtered results.

An API endpoint `GET /api/logs/audit` supports query params: `action` (prefix match), `actor`, `target`, `from`, `to`, `limit`, `offset`. Returns the list plus total count.

## Acceptance criteria

- [ ] `GET /api/logs/audit` returns `{ events: [...], total }`
- [ ] Query params: `action=user.&actor=admin@ppa.org&from=2026-06-01&limit=100`
- [ ] `/settings/logs/audit` page has action-type multi-select (with grouping: auth.*, user.*, data_entry.*, settings.*, migration.*)
- [ ] Table columns: timestamp, action badge, actor email, target, expandable details, IP address
- [ ] Date range picker and actor search input
- [ ] "Export CSV" button downloads filtered results as `.csv`
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed audit_logs rows, query with action filter, verify correct subset returned

## Blocked by

None — audit_logs table already exists and is populated by `lib/audit.service.ts`
