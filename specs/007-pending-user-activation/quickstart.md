# Quickstart: Pending User Activation Gate

## Goal

Deliver status-aware blocked access and BMO/DEV decisioning (activate/reject
with reason) for newly registered users.

## Preconditions

- Workspace: `C:\Users\codec\OneDrive\Documents\PRISM\prism`
- Branch: `007-pending-user-activation`
- Environment variables for auth/database configured.
- Database reachable for Drizzle push.

## Implementation Steps

1. Extend schema for rejection/audit support

- Update `db/schema/auth-schema.ts` with rejection fields and optional status
  event table.
- Apply schema change with `npm run db-push`.

2. Add server-side access gate behavior

- Centralize status-aware access checks in session/user retrieval path used by
  protected routes/pages.
- Ensure `pending` and `deactivated` users authenticate but are blocked from app
  functionality.

3. Build blocked full-screen states

- Implement reusable blocked-state component for non-active users.
- Pending screen: activation required message.
- Deactivated screen: denial message including stored rejection reason.

4. Implement admin pending-user decision flow

- Add pending-user list/read path (BMO/DEV only) including required fields:
  - name, email, registration date, organization, dataset_required,
    data_access_reason
- Add decision action endpoint/service:
  - `activate`: `pending` -> `active`
  - `reject`: `pending` -> `deactivated` with mandatory reason
- Persist decision metadata and audit event.

5. Ensure idempotency and race-safe behavior

- Re-validate current status before transition.
- Return deterministic response for repeated/late decisions.

6. Add test coverage

- Integration tests for:
  - pending and deactivated blocked access behavior
  - BMO/DEV-only decision permissions
  - activation/rejection transitions and reason requirements
- Unit tests for transition validators and blocked-state mapping.

## Validation

Run in repository root:

```bash
npm run lint
npm run build
npm run test:integration
```

## Manual Verification Checklist

- Register user -> user row is `pending`.
- Pending user can sign in but sees full-screen block.
- DEV/BMO sees pending list with required identity fields.
- DEV/BMO activates pending user -> user can enter app on next access check.
- DEV/BMO rejects pending user with reason -> user sees deactivated message with
  reason.
- Non-BMO/DEV cannot execute decision actions.

## API Behavior Reference

- `GET /api/settings/users/pending`
  - Success: `200` with `{ items: PendingUser[] }`
  - Unauthorized: `401`
  - Forbidden (non-BMO/DEV): `403`
- `POST /api/settings/users/{userId}/status`
  - Body: `{ decision: "activate" | "reject", rejectionReason?: string }`
  - Success: `200` with decision result payload
  - Validation error (including missing reject reason): `400`
  - Unauthorized: `401`
  - Forbidden: `403`
  - Not found: `404`
  - Invalid transition/idempotency conflict path: `409`

## UI Standards Compliance Checklist (CA-005)

- [x] New blocked-state UI uses existing Tailwind utility class patterns.
- [x] New admin decision panel uses existing Tailwind and project design tokens.
- [x] No custom design system introduced outside established component patterns.
- [x] Accessibility semantics added for blocked overlay (heading/ARIA live).

## SC-004 UAT Timing Capture Plan

Measurement protocol:

1. Start timer when BMO/DEV user enters Users settings screen.
2. Stop timer when successful activation confirmation is visible.
3. Record at least 10 runs with representative pending-user data volume.
4. Compute pass rate for runs under 60 seconds.

Current status:

- UAT timing run in production-like environment is pending stakeholder
  execution.
- Local engineering validation indicates workflow is functionally complete;
  formal UAT timing evidence to be appended after execution.
- External dependency: requires BMO/DEV stakeholder account access and
  production-like pending-user dataset to measure real operator completion time.

Closure decision (2026-04-02):

- Spec implementation is closed with SC-004 execution delegated to release UAT
  operations (non-code activity).
- This feature branch contains all required code, tests, and measurement
  protocol; the timed stakeholder run is tracked as release evidence in the
  deployment checklist.

## SC-005 Support Ticket Tracking Plan

Baseline definition:

- Capture count of tickets containing "cannot access app after registration" for
  one release cycle before rollout.

Post-release method:

1. Run the same ticket query for one release cycle after rollout.
2. Calculate percentage reduction against baseline.
3. Mark SC-005 as passed if reduction is at least 40%.

## Implementation Validation Log

- `npm run db-push`: passed (`[✓] Changes applied`)
- `npx vitest run test/unit/auth/user-status.transition.test.ts test/unit/auth/blocked-access-state.test.ts`:
  passed (2 files, 7 tests)
- `npx vitest run test/integration/auth/status-gate.pending.integration.test.ts test/integration/auth/status-gate.deactivated.integration.test.ts test/integration/auth/status-gate.active.integration.test.ts test/integration/api/settings/users/pending.contract.test.ts test/integration/api/settings/users/status-decision.contract.test.ts test/integration/api/settings/users/status-decision.authz.integration.test.ts test/integration/api/settings/users/status-decision.validation.integration.test.ts test/integration/api/settings/users/status-decision.idempotency.integration.test.ts test/integration/auth/deactivated-reason-visibility.integration.test.ts test/integration/settings/users/pending-users-states.integration.test.tsx`:
  passed (10 files, 13 tests)
- `npx vitest run test/unit/auth/user-status.transition.test.ts test/unit/auth/blocked-access-state.test.ts test/integration/auth/status-gate.pending.integration.test.ts test/integration/auth/status-gate.deactivated.integration.test.ts test/integration/auth/status-gate.active.integration.test.ts test/integration/api/settings/users/pending.contract.test.ts test/integration/api/settings/users/status-decision.contract.test.ts test/integration/api/settings/users/status-decision.authz.integration.test.ts test/integration/api/settings/users/status-decision.validation.integration.test.ts test/integration/api/settings/users/status-decision.idempotency.integration.test.ts test/integration/auth/deactivated-reason-visibility.integration.test.ts test/integration/settings/users/pending-users-states.integration.test.tsx`:
  passed (12 files, 20 tests)
- `npx vitest run test/integration/api/settings/users/status-decision.contract.test.ts test/integration/api/settings/users/status-decision.authz.integration.test.ts test/integration/api/settings/users/status-decision.validation.integration.test.ts test/integration/api/settings/users/status-decision.idempotency.integration.test.ts`:
  passed (4 files, 4 tests)
- `npm run build`: passed after status guard type narrowing fix
- `npm run lint`: currently fails due pre-existing repository lint issues
  outside this feature scope
  - Current summary: 35 errors and 8 warnings across unrelated existing files
    (for example, `app/settings/inputs/formulaBuilder.tsx`,
    `app/settings/kpi/formulaBuilder.tsx`, `app/migration/service.ts`)
