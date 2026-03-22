# Tasks: KPI Background Calculation Worker

**Input**: Design documents from `/specs/003-kpi-worker-calculation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/, quickstart.md

**Tests**: Include automated test tasks because the feature changes business
behavior, data transformations, and integration boundaries.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare worker module and feature-level scaffolding.

- [x] T001 Create KPI worker module entrypoint in
      app/data-entry/kpi-worker/index.ts
- [x] T002 Define worker domain types in app/data-entry/kpi-worker/types.ts
- [x] T003 [P] Add worker test fixtures in
      test/fixtures/kpi-worker/worker-scope.fixture.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core foundations that all user stories rely on.

**⚠️ CRITICAL**: No user story implementation begins before this phase
completes.

- [x] T004 Add `kpi_calculation_attempts` schema and audit fields in
      db/schema/kpi.ts
- [x] T005 [P] Implement attempt repository for lifecycle persistence in
      app/data-entry/kpi-worker/repository.ts
- [x] T006 [P] Implement formula evaluator utility in
      app/data-entry/kpi-worker/evaluator.ts
- [x] T007 [P] Implement scope/auth guard helper in
      app/data-entry/kpi-worker/scopeGuard.ts
- [x] T008 Implement worker orchestrator skeleton with lifecycle hooks in
      app/data-entry/kpi-worker/worker.ts
- [x] T009 Implement in-flight scope lock service in
      app/data-entry/kpi-worker/lock.ts
- [x] T010 Wire post-commit trigger gateway in
      app/data-entry/enter-data/service.ts

**Checkpoint**: Foundation complete; user stories can proceed.

---

## Phase 3: User Story 1 - Auto-calculate KPI after data entry (Priority: P1) 🎯 MVP

**Goal**: Trigger and complete KPI recalculation automatically after input
submit/update.

**Independent Test**: Submit a valid input mapped to a KPI and verify
asynchronous processing stores an updated KPI value for the reporting period.

### Tests for User Story 1

- [x] T011 [P] [US1] Add unit test for affected KPI resolution by formula inputs
      in test/unit/data-entry/kpi-worker/resolveTargets.test.ts
- [x] T012 [P] [US1] Add unit test for agg-level roll-up period summation rule
      in test/unit/data-entry/kpi-worker/rollupRules.test.ts
- [x] T013 [P] [US1] Add integration test for post-commit async trigger in
      test/integration/data-entry/kpi-worker-trigger.integration.test.ts

### Implementation for User Story 1

- [x] T014 [US1] Implement KPI target resolution from
      `kpi_definitions.formula_inputs` in
      app/data-entry/kpi-worker/resolveTargets.ts
- [x] T015 [US1] Implement report-period source input resolver with all-status
      aggregation in app/data-entry/kpi-worker/resolveInputs.ts
- [x] T016 [US1] Implement formula version snapshot capture at trigger time in
      app/data-entry/kpi-worker/snapshot.ts
- [x] T017 [US1] Implement KPI persistence/upsert path for successful
      computations in app/data-entry/kpi-worker/persistKpi.ts
- [x] T018 [US1] Integrate US1 compute flow into orchestrator in
      app/data-entry/kpi-worker/worker.ts
- [x] T019 [US1] Invoke worker trigger after successful data-entry commit in
      app/data-entry/enter-data/service.ts

**Checkpoint**: US1 is independently functional and testable.

---

## Phase 4: User Story 2 - Provide trustworthy calculation status (Priority: P2)

**Goal**: Expose pending/completed/failed processing status and readable failure
reasons.

**Independent Test**: Execute one successful and one failed calculation and
verify status endpoint/UI shows accurate state and reason text.

### Tests for User Story 2

- [x] T020 [P] [US2] Add unit test for status transition and failure-reason
      mapping in test/unit/data-entry/kpi-worker/statusLifecycle.test.ts
- [x] T021 [P] [US2] Add integration test for status retrieval in
      test/integration/data-entry/kpi-worker-status.integration.test.ts

### Implementation for User Story 2

- [x] T022 [US2] Implement status query service for attempt history in
      app/data-entry/kpi-worker/status.service.ts
- [x] T023 [US2] Implement status API route in
      app/api/data-entry/kpi-worker/status/route.ts
- [x] T024 [US2] Add status DTO types for data-entry surfaces in
      app/data-entry/types.ts
- [x] T025 [US2] Surface worker status and failure messages in
      app/data-entry/enter-data/page.tsx
- [x] T026 [US2] Reuse status presentation component for loading/empty/error
      states in components/data-entry/aggregated-processing-status.tsx

**Checkpoint**: US2 is independently functional and testable.

---

## Phase 5: User Story 3 - Safe recalculation on corrected input (Priority: P3)

**Goal**: Recalculate safely for corrected inputs with in-flight duplicate
execution suppression, deferred follow-up recalculation, and bounded retries.

**Independent Test**: Update an already-processed input and verify recalculation
behavior, in-flight dedupe, and retry policy all hold.

### Tests for User Story 3

- [x] T027 [P] [US3] Add unit test for same-scope in-flight duplicate
      suppression plus deferred follow-up marker policy in
      test/unit/data-entry/kpi-worker/inFlightIgnore.test.ts
- [x] T028 [P] [US3] Add integration test for corrected-input recalculation
      producing latest authoritative KPI in
      test/integration/data-entry/kpi-worker-recalc.integration.test.ts
- [x] T029 [P] [US3] Add integration test for transient retry (3 attempts with
      backoff) in
      test/integration/data-entry/kpi-worker-retry.integration.test.ts

### Implementation for User Story 3

- [x] T030 [US3] Enforce same-scope duplicate suppression with deferred
      follow-up recalculation in lock/orchestrator flow in
      app/data-entry/kpi-worker/lock.ts
- [x] T031 [US3] Implement retry/backoff policy with max-attempt enforcement in
      app/data-entry/kpi-worker/retry.ts
- [x] T032 [US3] Add recalculation path for input updates in
      app/data-entry/enter-data/service.ts
- [x] T033 [US3] Persist formula version and retry metadata in attempt records
      in db/schema/kpi.ts
- [x] T034 [US3] Ensure latest successful recalculation sets authoritative KPI
      value in app/data-entry/kpi-worker/persistKpi.ts

**Checkpoint**: US3 is independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, documentation, and validation evidence.

- [x] T035 [P] Update feature validation notes in
      specs/003-kpi-worker-calculation/quickstart.md
- [x] T036 Consolidate shared worker exports and cleanup internal APIs in
      app/data-entry/kpi-worker/index.ts
- [x] T037 [P] Add cross-story regression test coverage in
      test/integration/data-entry/kpi-worker-regression.integration.test.ts
- [x] T038 Run `npm run lint` and capture result notes in
      specs/003-kpi-worker-calculation/checklists/requirements.md
- [x] T039 Run `npm run build` and capture result notes in
      specs/003-kpi-worker-calculation/checklists/requirements.md
- [x] T040 Run `npm run test` and capture result notes in
      specs/003-kpi-worker-calculation/checklists/requirements.md
- [x] T041 [P] [US3] Implement deferred follow-up recalculation marker
      persistence and dispatch in app/data-entry/kpi-worker/lock.ts
- [x] T042 [P] [US1] Add unit test for roll-up inclusion/exclusion filters
      (`is_deleted`, `is_relevant`) in
      test/unit/data-entry/kpi-worker/rollupFilters.test.ts
- [x] T043 [P] Add integration benchmark for enqueue latency target (SC-001) in
      test/integration/data-entry/kpi-worker-enqueue-latency.integration.test.ts
- [x] T044 [P] Add integration benchmark for completion latency target (SC-002)
      in
      test/integration/data-entry/kpi-worker-completion-latency.integration.test.ts
- [x] T045 [P] [US2] Add integration test for unauthorized status route access
      denial in
      test/integration/data-entry/kpi-worker-status-auth.integration.test.ts
- [x] T046 [P] Add integration test for unauthorized worker-trigger mutation
      denial in
      test/integration/data-entry/kpi-worker-trigger-auth.integration.test.ts
- [x] T047 [P] Add accessibility test for keyboard focus, status announcements,
      and error readability in
      test/integration/data-entry/kpi-worker-status-a11y.integration.test.ts
- [x] T048 [P] Add integration timing assertion for corrected-input freshness
      target (SC-004 <= 5 minutes) in
      test/integration/data-entry/kpi-worker-freshness.integration.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion; blocks all user
  stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion.
- **Phase 4 (US2)**: Depends on Phase 2 completion; can run in parallel with US1
  after foundation.
- **Phase 5 (US3)**: Depends on Phase 2 completion; can run in parallel with
  US1/US2 after foundation.
- **Phase 6 (Polish)**: Depends on completion of the desired user stories.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories; delivers MVP.
- **US2 (P2)**: Depends on foundational attempt/status persistence but not on
  US1 completion.
- **US3 (P3)**: Depends on foundational lock/retry primitives; integrates with
  US1 recalculation flow.

### Within Each User Story

- Write tests first and confirm failure before implementation.
- Implement domain logic before route/UI wiring.
- Complete story-level integration before moving to polish.

---

## Parallel Execution Examples

### User Story 1

- Run T011, T012, and T013 in parallel.
- Run T014 and T015 in parallel once tests are in place.

### User Story 2

- Run T020 and T021 in parallel.
- Run T022 and T024 in parallel, then complete T023 and T025.

### User Story 3

- Run T027, T028, and T029 in parallel.
- Run T030 and T031 in parallel, then complete T032-T034.

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate US1 independently and demo.

### Incremental Delivery

1. Deliver US1 for auto-calculation baseline.
2. Deliver US2 for status trust and operational visibility.
3. Deliver US3 for safe corrected-input recalculation behavior.
4. Execute Phase 6 quality gates.

### Team Parallelization

1. Team aligns on Phase 1-2 foundation.
2. After foundation, split ownership:

- Engineer A: US1 compute core.
- Engineer B: US2 status APIs/UI.
- Engineer C: US3 retry/dedupe/recalc.
