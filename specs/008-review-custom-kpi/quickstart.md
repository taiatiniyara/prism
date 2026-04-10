# Quickstart: Custom KPI Review Workflow

## Goal

Implement and validate the custom KPI request lifecycle with reviewer decisions,
email notifications, submitter-only activation on approval, and reviewer-driven
global promotion.

## Prerequisites

- Node.js and npm installed
- Environment configured for database and SMTP:
  - `DATABASE_URL`
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
- Auth/role fixtures available for:
  - Standard submitter user
  - DEV reviewer user

## 1) Install and baseline

```bash
npm install
npm run lint
npm run build
```

## 2) Implement schema and persistence

1. Add schema objects for custom KPI request, decisions, lifecycle events,
   visibility scope, and email delivery attempts.
2. Apply schema updates with the repository-standard Drizzle path:

```bash
npm run db-push
```

3. Verify schema and constraints in local database.

## 3) Implement API and service flows

1. Submission flow:
   - Submit request as authenticated non-DEV user
   - Enforce duplicate-pending prevention
2. Reviewer decision flow:
   - Approve, reject, replace (manual replacement selection + rationale)
   - Restrict all review mutations to DEV reviewers
3. Override flow:
   - Allow override only for DEV reviewers
   - Record override lineage in audit
4. Promotion flow:
   - Allow any DEV reviewer to promote approved request visibility from
     submitter-only to global

## 4) Implement notification integration

1. Compose and send email outcome after final decision commit.
2. Persist delivery attempts and retry metadata.
3. Ensure email failure does not rollback decision state.

## 5) Validate behavior with automated tests

```bash
npm run test:unit
npm run test:integration
```

Recommended test coverage:

- Unit tests:
  - Duplicate detection logic
  - Decision transition validation
  - Override authorization and lineage
  - Promotion authorization and scope change
  - Email retry state transitions
- Integration tests:
  - End-to-end request -> decision -> email path
  - Error responses for unauthorized reviewer actions
  - Replacement decision requiring selected KPI and rationale

## 6) Final quality gate

```bash
npm run lint
npm run build
npm run test
```

## 7) Manual verification checklist

1. Submitter creates request and sees pending status.
2. DEV reviewer approves request; submitter can use KPI but others cannot.
3. DEV reviewer promotes KPI globally; non-submitter can now use KPI.
4. DEV reviewer performs replace with rationale and selected existing KPI.
5. DEV reviewer performs override; audit history shows both prior and current
   decisions.
6. Decision email arrives with outcome and rationale.

## 8) Validation output notes (2026-04-10)

### Lint (`npm run lint`)

- Result: failed
- Summary: 44 problems (36 errors, 8 warnings)
- Notes: issues are pre-existing outside this feature slice (examples include
  `app/settings/*`, `app/migration/service.ts`, and review-kpi unrelated
  integration hooks).

### Build (`npm run build`)

- Result: passed
- Summary: Next.js production build completed successfully and included the new
  routes:
  - `/api/data-entry/custom-kpi/email-retries`
  - `/api/data-entry/custom-kpi/requests/[requestId]/decision`
  - `/api/data-entry/custom-kpi/requests/[requestId]/promotion`

### Tests (`npm run test`)

- Result: failed (existing unrelated tests)
- Summary: 3 failed files, 80 passed files; 6 failed tests, 128 passed tests
- Failing tests:
  - `test/integration/data-entry/review-kpi/async-states.integration.test.tsx`
  - `test/integration/data-entry/review-kpi/rows.integration.test.tsx`
  - `test/unit/data-entry/aggregated-worker/orchestrator-cascade.test.ts`
- Feature-targeted custom KPI suites pass.

## 9) Success criteria measurement reports (2026-04-10)

Executed with a parameterized SQL probe against the configured `DATABASE_URL`.

### SC-005 duplicate pending rate baseline and comparison

- Baseline query method:
  - Group pending requests by `(submitter_user_id, definition_fingerprint)`
  - Count duplicates as `sum(count - 1)` for groups where `count > 1`
- Baseline run output:
  - `duplicate_pending = 0`
  - `pending_total = 0`
  - Derived rate: `0 / 0` (no pending sample yet)
- Post-rollout comparison run output:
  - `duplicate_pending = 0`
  - `pending_total = 0`
  - Delta: `0`

### SC-001 pending queue visibility threshold

- Query output:
  - `max_pending_visibility_latency_ms = 0`
- Interpretation:
  - No pending records currently in the dataset, so observed value is zero.

### SC-002 decision completion threshold

- Query output:
  - `avg_decision_cycle_ms = 0`
- Interpretation:
  - No decision records currently in the dataset, so observed value is zero.
