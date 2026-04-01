# Tasks: Pending User Activation Gate

**Input**: Design documents from `/specs/007-pending-user-activation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/pending-user-admin.openapi.yaml, quickstart.md

**Tests**: Automated tests are required for this feature because it changes
authentication-adjacent authorization behavior, status transitions, and API
integration boundaries.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare feature scaffolding and shared validation helpers.

- [x] T001 Create pending-user API folder scaffolding in
      app/api/settings/users/pending/route.ts
- [x] T002 Create status-decision API folder scaffolding in
      app/api/settings/users/[userId]/status/route.ts
- [x] T003 [P] Create shared decision validation schema in
      app/api/settings/users/\_lib/validators.ts
- [x] T004 [P] Create blocked-access UI component scaffold in
      components/auth/blocked-access-overlay.tsx
- [x] T005 [P] Add auth status fixtures for tests in
      test/fixtures/auth/user-status.fixture.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schema and server-side status infrastructure that all stories
depend on.

**CRITICAL**: No user story work starts until this phase is complete.

- [x] T006 Extend user schema with rejection metadata in
      db/schema/auth-schema.ts
- [x] T007 Add user status event audit table in db/schema/auth-schema.ts
- [x] T008 [P] Add typed status transition guards and helpers in
      lib/user-status.ts
- [x] T009 [P] Extend current-user payload with status and rejection reason in
      lib/user.service.ts
- [x] T010 Extend session payload with status-aware blocked state fields in
      lib/session.service.ts
- [x] T011 Add server-side blocked-status route guard utilities in
      lib/auth-status-guard.ts
- [x] T012 [P] Add foundational unit tests for transition guard rules in
      test/unit/auth/user-status.transition.test.ts
- [x] T013 Execute `npm run db-push` and record schema-change verification
      evidence in specs/007-pending-user-activation/quickstart.md

**Checkpoint**: Foundation ready. User stories can now be implemented.

---

## Phase 3: User Story 1 - Block Pending User Access (Priority: P1) 🎯 MVP

**Goal**: Pending and deactivated users can authenticate but cannot access
protected app functionality.

**Independent Test**: Sign in with `pending` or `deactivated` users and verify
all protected routes show blocking state; sign in with `active` user and verify
normal access.

### Tests for User Story 1

- [x] T014 [P] [US1] Add integration test for pending-user blocked access across
      protected routes in
      test/integration/auth/status-gate.pending.integration.test.ts
- [x] T015 [P] [US1] Add integration test for deactivated-user blocked access
      across protected routes in
      test/integration/auth/status-gate.deactivated.integration.test.ts
- [x] T016 [P] [US1] Add integration test for active-user normal access in
      test/integration/auth/status-gate.active.integration.test.ts

### Implementation for User Story 1

- [x] T017 [US1] Implement status-aware route gating logic for protected
      matchers in proxy.ts
- [x] T018 [US1] Implement blocked-access rendering orchestration in
      app/layout.tsx
- [x] T019 [US1] Implement blocked-access overlay component states for pending
      and deactivated users in components/auth/blocked-access-overlay.tsx
- [x] T020 [US1] Add blocked-status message builder utility in
      app/auth/blocked/state.ts
- [x] T021 [US1] Ensure navigation/sidebar suppression when user is blocked in
      components/layout/sidebar.tsx
- [x] T022 [US1] Wire rejection reason exposure for deactivated user blocked
      view in lib/session.service.ts

**Checkpoint**: User Story 1 independently functional and testable (MVP).

---

## Phase 4: User Story 2 - Decide Pending Users (Priority: P2)

**Goal**: BMO/DEV users can list pending users and decide activate/reject with
required rejection reason.

**Independent Test**: BMO/DEV can list pending users, activate one user, reject
one user with reason, and non-BMO/DEV cannot perform decision actions.

### Tests for User Story 2

- [x] T023 [P] [US2] Add contract test for GET pending users endpoint in
      test/integration/api/settings/users/pending.contract.test.ts
- [x] T024 [P] [US2] Add contract test for POST status decision endpoint in
      test/integration/api/settings/users/status-decision.contract.test.ts
- [x] T025 [P] [US2] Add integration test for role-restricted decision actions
      in
      test/integration/api/settings/users/status-decision.authz.integration.test.ts
- [x] T026 [P] [US2] Add integration test for reject reason required validation
      in
      test/integration/api/settings/users/status-decision.validation.integration.test.ts
- [x] T027 [P] [US2] Add integration test for idempotent repeated decisions in
      test/integration/api/settings/users/status-decision.idempotency.integration.test.ts

### Implementation for User Story 2

- [x] T028 [US2] Implement pending-user list API with required identity fields
      in app/api/settings/users/pending/route.ts
- [x] T029 [US2] Implement activate/reject decision API with role checks and
      transition validation in app/api/settings/users/[userId]/status/route.ts
- [x] T030 [US2] Implement server-side decision service and audit event writes
      in app/settings/users/service.ts
- [x] T031 [US2] Add rejection-reason validation schema and request parsing in
      app/api/settings/users/\_lib/validators.ts
- [x] T032 [US2] Update users settings page with pending-only admin decision UI
      in app/settings/users/page.tsx
- [x] T033 [US2] Add reusable pending-user decision panel component in
      components/settings/pending-user-decision-panel.tsx
- [x] T034 [US2] Add optimistic/success/error state handling for decision
      actions in components/settings/pending-user-decision-panel.tsx

**Checkpoint**: User Story 2 independently functional and testable.

---

## Phase 5: User Story 3 - Understand Access Status (Priority: P3)

**Goal**: Blocked users clearly understand status, reason (for deactivated), and
next steps.

**Independent Test**: Pending and deactivated users both see clear, accessible
full-screen messaging with status-specific guidance and rejection reason
visibility rules.

### Tests for User Story 3

- [x] T035 [P] [US3] Add unit test for blocked message mapping and required
      fields in test/unit/auth/blocked-access-state.test.ts
- [x] T036 [P] [US3] Add integration test for deactivated rejection-reason
      visibility to affected user in
      test/integration/auth/deactivated-reason-visibility.integration.test.ts
- [x] T037 [P] [US3] Add integration test for loading/empty/error states in
      pending decision UI in
      test/integration/settings/users/pending-users-states.integration.test.tsx

### Implementation for User Story 3

- [x] T038 [US3] Finalize status-specific copy and next-step guidance in
      components/auth/blocked-access-overlay.tsx
- [x] T039 [US3] Add accessibility semantics (headings, focus target, aria-live
      region) to blocked overlay in components/auth/blocked-access-overlay.tsx
- [x] T040 [US3] Add explicit empty/error handling for pending-user list in
      app/settings/users/page.tsx

**Checkpoint**: User Story 3 independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality, security, and delivery validation across all
stories.

- [x] T041 [P] Document API behavior and status transitions in
      specs/007-pending-user-activation/quickstart.md
- [x] T042 [P] Add final contract/schema notes for decision events in
      specs/007-pending-user-activation/data-model.md
- [x] T043 Run lint/build/test validation commands and record outcomes in
      specs/007-pending-user-activation/quickstart.md
- [x] T044 Perform cross-story refactor to remove duplicated status logic in
      lib/user-status.ts
- [x] T045 [P] Verify new UI surfaces use Tailwind and shadcn-compatible
      component patterns and record compliance checklist in
      specs/007-pending-user-activation/quickstart.md
- [x] T046 Define and run UAT timing capture for SC-004 (time-to-locate and
      activate pending user) and record results in
      specs/007-pending-user-activation/quickstart.md
- [x] T047 Define support-ticket baseline and post-release measurement method
      for SC-005 and record tracking approach in
      specs/007-pending-user-activation/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies
- Foundational (Phase 2): depends on Phase 1 and blocks all user stories
- User Stories (Phases 3-5): depend on Phase 2 completion
- Polish (Phase 6): depends on completion of targeted user stories

### User Story Dependencies

- US1 (P1): starts immediately after Foundational phase
- US2 (P2): starts after Foundational phase; can run in parallel with US1 once
  shared gating helpers are merged
- US3 (P3): starts after Foundational phase; depends on blocked overlay baseline
  from US1 but remains independently testable

### Within Each User Story

- Tests first (write and verify failing), then implementation
- Validation/parsing before mutation endpoints
- Server-side authorization and transition checks before UI action wiring

## Parallel Opportunities

- Setup tasks marked [P]: T003, T004, T005
- Foundational tasks marked [P]: T008, T009, T012
- US1 tests marked [P]: T014, T015, T016
- US2 tests marked [P]: T023, T024, T025, T026, T027
- US3 tests marked [P]: T035, T036, T037
- Polish tasks marked [P]: T041, T042, T045

## Parallel Example: User Story 1

```bash
# Run these in parallel after foundational completion:
T014 test/integration/auth/status-gate.pending.integration.test.ts
T015 test/integration/auth/status-gate.deactivated.integration.test.ts
T016 test/integration/auth/status-gate.active.integration.test.ts
```

## Parallel Example: User Story 2

```bash
# Parallel contract/integration checks:
T023 test/integration/api/settings/users/pending.contract.test.ts
T024 test/integration/api/settings/users/status-decision.contract.test.ts
T025 test/integration/api/settings/users/status-decision.authz.integration.test.ts
```

## Parallel Example: User Story 3

```bash
# Parallel quality checks for blocked UX:
T035 test/unit/auth/blocked-access-state.test.ts
T036 test/integration/auth/deactivated-reason-visibility.integration.test.ts
T037 test/integration/settings/users/pending-users-states.integration.test.tsx
```

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 and Phase 2.
2. Deliver Phase 3 (US1) and validate blocked access behavior.
3. Demo/deploy MVP with pending/deactivated gate.

### Incremental Delivery

1. Add US1 for safe access control baseline.
2. Add US2 for BMO/DEV decision workflow.
3. Add US3 for improved blocked-user clarity and accessibility.
4. Complete Phase 6 validation and cleanup.
