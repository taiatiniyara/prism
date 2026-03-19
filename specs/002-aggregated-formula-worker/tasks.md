# Tasks: Aggregated Formula Worker Processing

**Input**: Design documents from /specs/002-aggregated-formula-worker/  
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/, quickstart.md

**Tests**: Include automated tests because this feature changes business
behavior, data transformations, concurrency semantics, and async integration
boundaries.

**Organization**: Tasks are grouped by user story so each story can be
implemented and validated independently.

## Format: [ID] [P?] [Story] Description

- [P] indicates parallelizable work (different files, no blocking dependency)
- [Story] label appears only in user-story phases
- Every task includes an explicit file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared scaffolding for worker execution and test coverage.

- [x] T001 Create aggregated worker module folder structure in
      app/data-entry/enter-data/services/aggregated-worker/
- [x] T002 Add aggregated worker test fixture builders in
      test/fixtures/aggregated-formulas.ts
- [x] T003 [P] Add unit test bootstrap file for aggregated worker domain tests
      in test/unit/data-entry/aggregated-worker/setup.ts
- [x] T004 [P] Add integration test helper for async post-commit trigger
      assertions in test/integration/data-entry/helpers/aggregated-worker.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core shared components required by all stories.

**Critical**: No user story tasks should begin until this phase is complete.

- [x] T005 Define aggregated run, snapshot, and outcome TypeScript contracts in
      app/data-entry/types.ts
- [x] T006 Implement formula variable token extraction utility in
      app/data-entry/enter-data/services/aggregated-worker/variable-parser.ts
- [x] T007 Implement reporting-scope dependency reader for source values in
      app/data-entry/enter-data/services/aggregated-worker/source-reader.ts
- [x] T008 Implement source snapshot builder service in
      app/data-entry/enter-data/services/aggregated-worker/snapshot-builder.ts
- [x] T009 Implement authorization guard helper for worker reads and writes in
      app/data-entry/enter-data/services/aggregated-worker/scope-auth.ts
- [x] T010 Implement worker run coordinator entrypoint in
      app/data-entry/enter-data/services/aggregated-worker/orchestrator.ts
- [x] T011 Wire non-blocking post-commit trigger call site in
      app/data-entry/enter-data/service.ts

**Checkpoint**: Foundation complete, user stories can proceed.

---

## Phase 3: User Story 1 - Auto-calculate eligible aggregated inputs (Priority: P1)

**Goal**: Automatically calculate and persist eligible aggregated formula
targets after successful data-entry writes.

**Independent Test**: Save source inputs with complete dependencies and verify
eligible aggregated targets are calculated and persisted.

### Tests for User Story 1

- [x] T012 [P] [US1] Add unit tests for target eligibility filtering in
      test/unit/data-entry/aggregated-worker/eligibility.test.ts
- [x] T013 [P] [US1] Add unit tests for formula variable resolution in
      test/unit/data-entry/aggregated-worker/variable-resolution.test.ts
- [x] T014 [US1] Add integration test for asynchronous post-commit calculation
      trigger in
      test/integration/data-entry/aggregated-worker/trigger-and-calculate.test.ts

### Implementation for User Story 1

- [x] T015 [US1] Implement eligible target selector for aggregated true plus
      non-empty formula in
      app/data-entry/enter-data/services/aggregated-worker/target-selector.ts
- [x] T016 [US1] Implement formula evaluator for resolved dependency sets in
      app/data-entry/enter-data/services/aggregated-worker/evaluator.ts
- [x] T017 [US1] Implement calculated target writer that upserts data-entry
      table values for aggregated targets using the same report period and
      target `inputDefId` in
      app/data-entry/enter-data/services/aggregated-worker/target-writer.ts
- [x] T018 [US1] Integrate selector, snapshot builder, evaluator, and key-based
      writer (`reportPeriodId` + `inputDefId` + scope) in orchestrator flow in
      app/data-entry/enter-data/services/aggregated-worker/orchestrator.ts
- [x] T019 [US1] Add integration assertion that save path emits exactly one
      asynchronous post-commit trigger invocation (no duplicate worker dispatch)
      in
      test/integration/data-entry/aggregated-worker/trigger-and-calculate.test.ts

**Checkpoint**: User Story 1 independently functional and testable.

---

## Phase 4: User Story 2 - Continue processing when dependencies are missing (Priority: P2)

**Goal**: Skip ineligible or failed targets and continue processing remaining
targets without blocking the run.

**Independent Test**: Save mixed inputs where one target has missing or unknown
dependency and another is computable; verify skip plus continued calculation.

### Tests for User Story 2

- [x] T020 [P] [US2] Add unit tests for missing dependency classification in
      test/unit/data-entry/aggregated-worker/missing-dependency.test.ts
- [x] T021 [P] [US2] Add unit tests for unknown variable classification in
      test/unit/data-entry/aggregated-worker/unknown-variable.test.ts
- [x] T022 [P] [US2] Add unit tests for runtime evaluation-error classification
      in test/unit/data-entry/aggregated-worker/evaluation-error.test.ts
- [x] T023 [US2] Add integration test for skip-and-continue behavior in
      test/integration/data-entry/aggregated-worker/skip-and-continue.test.ts

### Implementation for User Story 2

- [x] T024 [US2] Implement dependency-status classifier for missing and unknown
      variables in
      app/data-entry/enter-data/services/aggregated-worker/dependency-classifier.ts
- [x] T025 [US2] Implement per-target skip outcome generation with reason codes
      in app/data-entry/enter-data/services/aggregated-worker/outcome-builder.ts
- [x] T026 [US2] Update evaluator to surface runtime failures as skipped
      outcomes without aborting run in
      app/data-entry/enter-data/services/aggregated-worker/evaluator.ts
- [x] T027 [US2] Enforce source-snapshot-only evaluation semantics across the
      run in
      app/data-entry/enter-data/services/aggregated-worker/orchestrator.ts
- [x] T044 [P] [US2] Add integration test asserting skipped targets do not
      upsert or overwrite existing data-entry values for (`reportPeriodId` +
      `inputDefId` + scope) in
      test/integration/data-entry/aggregated-worker/skip-preserves-existing-value.test.ts
- [x] T045 [US2] Update target writer/orchestrator flow to enforce no-write for
      skipped outcomes and preserve existing data-entry values in
      app/data-entry/enter-data/services/aggregated-worker/target-writer.ts

**Checkpoint**: User Stories 1 and 2 independently functional and testable.

---

## Phase 5: User Story 3 - Traceable processing outcome (Priority: P3)

**Goal**: Provide run-level and target-level outcome visibility for operational
review, including concurrent overlap behavior.

**Independent Test**: Execute mixed and overlapping runs and verify review
surface shows run outcomes and target skip reasons.

### Tests for User Story 3

- [x] T028 [P] [US3] Add unit tests for run summary and outcome aggregation in
      test/unit/data-entry/aggregated-worker/run-summary.test.ts
- [x] T029 [P] [US3] Add integration test for concurrent same-scope
      last-write-wins behavior in
      test/integration/data-entry/aggregated-worker/concurrency-last-write-wins.test.ts
- [x] T030 [US3] Add integration test for operations review outcome retrieval in
      test/integration/data-entry/aggregated-worker/outcome-review.test.ts

### Implementation for User Story 3

- [x] T031 [US3] Implement run/outcome persistence adapter for operational
      review in
      app/data-entry/enter-data/services/aggregated-worker/outcome-store.ts
- [x] T032 [US3] Implement operations review query service for run and target
      outcomes in
      app/data-entry/enter-data/services/aggregated-worker/review-service.ts
- [x] T033 [US3] Add route handler for aggregated run review API in
      app/api/data-entry/aggregated-runs/route.ts
- [x] T034 [US3] Add route handler for aggregated run target outcomes in
      app/api/data-entry/aggregated-runs/[runId]/route.ts
- [x] T035 [US3] Add operations review UI section for run outcomes and skip
      reasons in app/data-entry/review-kpi/page.tsx
- [x] T036 [US3] Add reusable outcome status badge and reason display component
      in components/data-entry/aggregated-outcome-badge.tsx
- [x] T046 [US3] Add non-blocking processing-status feedback in data-entry flow
      with accessible live-region semantics in
      app/data-entry/enter-data/page.tsx
- [x] T047 [US3] Add reusable data-entry processing status component for
      completed/skipped summary aligned with existing UI patterns in
      components/data-entry/aggregated-processing-status.tsx

**Checkpoint**: All user stories independently functional and testable.

---

## Phase 6: Polish and Cross-Cutting Concerns

**Purpose**: Final hardening, validation evidence, and documentation updates.

- [x] T037 [P] Add unit test coverage for parser and evaluator edge cases (no
      variables, repeated variable, non-finite result) in
      test/unit/data-entry/aggregated-worker/edge-cases.test.ts
- [x] T038 [P] Add integration test for non-blocking save response under active
      processing in
      test/integration/data-entry/aggregated-worker/non-blocking-save.test.ts
- [x] T039 Add validation and runbook notes for operations review in
      specs/002-aggregated-formula-worker/quickstart.md
- [x] T040 Record lint validation results in
      specs/002-aggregated-formula-worker/quickstart.md
- [x] T041 Record build validation results in
      specs/002-aggregated-formula-worker/quickstart.md
- [x] T042 Record test validation results in
      specs/002-aggregated-formula-worker/quickstart.md
- [x] T043 Reconcile checklist evidence links for planning and master checklists
      in specs/002-aggregated-formula-worker/checklists/master.md

---

## Dependencies and Execution Order

### Phase Dependencies

- Setup (Phase 1): starts immediately
- Foundational (Phase 2): depends on Setup completion and blocks all story work
- User Story phases (Phase 3 to Phase 5): depend on Foundational completion
- Polish (Phase 6): depends on completion of all target stories

### User Story Dependencies

- US1: no dependency on other stories after Foundational
- US2: depends on US1 evaluator and orchestration flow being in place
- US3: depends on US1 and US2 outcomes being produced consistently

### Within Each Story

- Tests first (expected failing before implementation)
- Domain logic before integration wiring
- Integration before story checkpoint

## Parallel Opportunities

- Setup: T003 and T004 can run in parallel after T001 and T002 start
- Foundational: T006 through T010 can run in parallel once T005 begins
- US1: T012 and T013 parallel; T014 after core US1 implementation
- US2: T020, T021, and T022 parallel; T023 after implementation
- US3: T028 and T029 parallel; API route tasks T033 and T034 parallel after T032
- Polish: T037 and T038 parallel

## Parallel Example per Story

### US1

- T012 and T013 in parallel, then T015 through T019, then T014

### US2

- T020, T021, T022 in parallel, then T024 through T027, then T023

### US3

- T028 and T029 in parallel, then T031 and T032, then T033 and T034 in parallel,
  then T035 and T036, then T030

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2
2. Complete Phase 3 (US1)
3. Validate US1 independently and demo core value

### Incremental Delivery

1. Deliver US1 auto-calculation
2. Add US2 skip-and-continue resiliency
3. Add US3 operational traceability and review surface
4. Finish with Phase 6 hardening and evidence capture

### Team Parallelization

1. One engineer handles worker orchestration and evaluator
2. One engineer handles API review surface and data retrieval
3. One engineer handles tests and edge-case hardening
