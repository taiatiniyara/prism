# Quickstart - Review KPI Values Workspace

## Prerequisites

- Node.js and npm installed
- Access to the project database configured via environment variables
- Authenticated user accounts for at least:
  - editor role (can edit inputs and comment)
  - reviewer/read-only role (can view updates but cannot edit)

## 1. Install and run

```bash
npm install
npm run dev
```

Open `/data-entry/review-kpi`.

## 2. Baseline validation commands

```bash
npm run lint
npm run build
npm run test:unit
npm run test:integration
```

## 3. Functional walkthrough

1. Apply top filters: report type, report period, KPI category, KPI subcategory,
   service area.
2. Refresh the page and verify filter values are restored from cookies.
3. Confirm KPI rows render with three sections per row:
   - left: input values
   - middle: KPI formula
   - right: KPI result
4. Edit one input as editor user and save.
5. Verify KPI result updates for that row.
6. Add a comment on the same input and verify author/timestamp appear.

## 4. Realtime and concurrency verification

1. Open the same KPI context in two browsers/users.
2. From user A, update an input and save.
3. Verify user B sees updated input and result without manual refresh (within 2
   seconds p95 target).
4. Start stale edit test:
   - user A and user B both modify same input from old state
   - user A saves first
   - user B saves second
5. Verify user B gets conflict response and latest committed value is shown; no
   silent overwrite occurs.

## 5. Authorization checks

1. Attempt edit/comment with read-only user.
2. Verify mutation is blocked with forbidden/authorization error.
3. Confirm read-only user still receives authorized real-time updates for
   visible rows.

## 6. Failure-state checks

1. Force invalid input value and verify field-level validation message.
2. Simulate transient sync interruption (disconnect/reconnect) and verify page
   reconciles to latest values after reconnect.
3. Verify loading, empty, and error states are visible and accessible via
   keyboard/screen reader semantics.
