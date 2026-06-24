# Issue 10 — Security & Auth Dashboard

## What to build

A `/settings/security` page giving DEV users visibility into authentication and authorization activity. Three sections:

**Failed Login Monitor:** Detects login failure spikes by comparing the last hour's failure count against the 24-hour hourly average. A spike indicator (2x above average) is highlighted red. The spike detection reads from `audit_logs` where `action = 'auth.login_failed'`.

**Active Sessions:** Lists all non-expired sessions from the `session` table with: user email, role, IP address, user agent (parsed to browser + OS), login timestamp, and expires at. A "Revoke" button deletes the session row. Total active user count is shown.

**Role Change History:** Recent role changes from `audit_logs` where `action = 'user.role_change'`, showing: timestamp, target user, old role → new role, changed by whom. Last 7 days by default.

**Registration Funnel:** Counts of users by status: pending (awaiting approval), active, deactivated. Shown as a horizontal funnel bar.

An API endpoint `GET /api/security/overview` returns all four data sets.

## Acceptance criteria

- [ ] `GET /api/security/overview` returns `{ failedLoginSpike: { currentHour, avgHourly, isSpike }, activeSessions: [...], roleChanges: [...], registrationFunnel: { pending, active, deactivated } }`
- [ ] Failed login spike detection compares current hour to 24h baseline; flags if > 2x
- [ ] `/settings/security` page has four card sections matching the data
- [ ] Active sessions table shows parsed user agent (browser + OS) and IP, with revoke button
- [ ] Revoke action sends `DELETE` to remove the session row
- [ ] Role change table shows old→new transition with arrow
- [ ] Registration funnel shown as horizontal bar with counts and percentages
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed audit_logs and sessions, verify spike detection and session listing

## Blocked by

None — `session` table (Better Auth) and `audit_logs` table already exist
