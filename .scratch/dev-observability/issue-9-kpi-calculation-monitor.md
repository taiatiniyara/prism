# Issue 9 — KPI Calculation Monitor

## What to build

A `/settings/kpi/health` page showing the operational status of all KPI formula calculations. The page displays counts of currently pending, in-progress, failed, and recently completed calculations. A table lists individual calculation attempts with: KPI definition name, utility, report period, status, duration, retry count, error message (if failed), and timestamp.

A "Retry failed" button per attempt re-queues that specific calculation. A "Retry all failed" button retries all currently failed calculations in the filtered view.

Summary metrics: average calculation duration per KPI, failure rate over time (sparkline), and a breakdown of failure reasons (top error messages).

An API endpoint `GET /api/kpi/calculation-status?status=&kpi_id=&utility_id=&period_id=` returns the data. A `POST /api/kpi/calculation-retry` endpoint re-queues specified calculations.

## Acceptance criteria

- [ ] `GET /api/kpi/calculation-status` returns `{ summary: { pending, inProgress, failed, completed24h }, attempts: [...], avgDurationByKpi: {...}, topFailureReasons: [...] }`
- [ ] Query filters work: `status=failed&utility_id=5`
- [ ] `POST /api/kpi/calculation-retry` accepts `{ attemptIds: [...] }` and re-queues them
- [ ] `/settings/kpi/health` page has summary cards (pending/in-progress/failed counts)
- [ ] Table with sortable columns: KPI, utility, period, status, duration, retries, error, timestamp
- [ ] "Retry" action button per row, "Retry all failed" at top (with confirmation)
- [ ] Failure reasons breakdown as a table showing error message and count
- [ ] Status filter tabs: All | Pending | In Progress | Failed | Completed
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed calculation attempts, query by status filter, verify retry endpoint

## Blocked by

None — `kpi_calculation_attempts` table already exists
