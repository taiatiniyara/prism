# Tasks: Review KPI Values Workspace

**Input**: Design documents from /specs/005-review-kpi-values/
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/review-kpi.openapi.yaml, quickstart.md

**Tests**: Automated tests are included because this feature changes business
behavior, authorization boundaries, data mutation flow, and API contracts.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create feature module scaffolding and test layout.

- [x] T001 Create review-kpi module scaffolding in
      app/data-entry/review-kpi/page.tsx, app/data-entry/review-kpi/service.ts,
      app/data-entry/review-kpi/actions.ts, and
      app/data-entry/review-kpi/types.ts
- [x] T002 Create API scaffolding in app/api/data-entry/review-kpi/route.ts,
      app/api/data-entry/review-kpi/events/route.ts,
      app/api/data-entry/review-kpi/inputs/[dataEntryId]/route.ts, and
      app/api/data-entry/review-kpi/inputs/[dataEntryId]/comments/route.ts
- [x] T003 [P] Create review-kpi test suites in
      test/unit/data-entry/review-kpi/.gitkeep and
      test/integration/data-entry/review-kpi/.gitkeep

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared foundations required by all stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Define shared view model and contract types in
      app/data-entry/review-kpi/types.ts
- [x] T005 Implement authenticated scope and role authorization helpers in
      app/data-entry/review-kpi/service.ts
- [x] T006 [P] Implement filter context adapter using existing cookie and
      cascade rules in app/data-entry/review-kpi/service.ts
- [x] T007 [P] Implement query and payload validators for review-kpi routes in
      app/api/data-entry/review-kpi/\_lib/validators.ts
- [x] T008 Implement shared page shell with loading, empty, and error state
      primitives in components/data-entry/review-kpi-shell.tsx
- [x] T009 [P] Add reusable review-kpi fixtures for report/filter/input
      scenarios in test/fixtures/review-kpi.ts

**Checkpoint**: Foundation complete. User stories can start.

---

## Phase 3: User Story 1 - Review KPI Rows (Priority: P1) MVP

**Goal**: Render KPI rows with left input values, middle formula, and right
result.

**Independent Test**: Open /data-entry/review-kpi with seeded KPI data and
verify each row renders all three sections and handles empty state.

### Tests for User Story 1

- [x] T010 [P] [US1] Add contract test for GET /api/data-entry/review-kpi in
      test/integration/data-entry/review-kpi/list.contract.test.ts
- [x] T011 [P] [US1] Add integration test for KPI row rendering and empty state
      in test/integration/data-entry/review-kpi/rows.integration.test.tsx

### Implementation for User Story 1

- [x] T012 [US1] Implement KPI row aggregation query and mapping in
      app/data-entry/review-kpi/service.ts
- [x] T013 [P] [US1] Implement GET list handler in
      app/api/data-entry/review-kpi/route.ts
- [x] T014 [P] [US1] Build reusable row renderer for inputs/formula/result in
      components/data-entry/review-kpi-row.tsx
- [x] T015 [US1] Compose server page for KPI row list rendering in
      app/data-entry/review-kpi/page.tsx
- [x] T016 [US1] Add row-level loading, empty, and data-error handling in
      app/data-entry/review-kpi/page.tsx

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Filter KPI Context (Priority: P2)

**Goal**: Provide cookie-backed top filters with category-to-subcategory cascade
behavior.

**Independent Test**: Apply filter combinations, refresh, and confirm cookie
restoration and category/subcategory parent filtering.

### Tests for User Story 2

- [x] T017 [P] [US2] Add contract test for filter query validation and cascade
      constraints in
      test/integration/data-entry/review-kpi/filters.contract.test.ts
- [x] T018 [P] [US2] Add integration test for cookie persistence and parent_id
      cascade in
      test/integration/data-entry/review-kpi/filters.integration.test.tsx

### Implementation for User Story 2

- [x] T019 [US2] Implement filter option loaders and category/subcategory
      sanitization in app/data-entry/review-kpi/service.ts
- [x] T020 [P] [US2] Implement filter update action with cookie persistence in
      app/data-entry/review-kpi/actions.ts
- [x] T021 [P] [US2] Implement top filter UI client using existing selector
      primitives in app/data-entry/review-kpi/filters.client.tsx
- [x] T022 [US2] Wire filter state to list fetch and route query in
      app/data-entry/review-kpi/page.tsx and
      app/api/data-entry/review-kpi/route.ts
- [x] T037 [US2] Add filter apply pending and failure UI states in
      app/data-entry/review-kpi/filters.client.tsx and
      app/data-entry/review-kpi/page.tsx

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 - Edit Inputs With Discussion and Realtime Sync (Priority: P3)

**Goal**: Enable input edits, per-input comments, optimistic concurrency
conflicts, and scoped realtime cross-user updates.

**Independent Test**: Two users in same KPI context can observe live updates,
conflict behavior blocks stale saves, and comments are posted with
author/timestamp.

### Tests for User Story 3

- [x] T023 [P] [US3] Add contract tests for PATCH input conflict and POST
      comments in
      test/integration/data-entry/review-kpi/mutations.contract.test.ts
- [x] T024 [P] [US3] Add integration test for edit, recalculation trigger, and
      conflict recovery in
      test/integration/data-entry/review-kpi/mutations.integration.test.tsx
- [x] T025 [P] [US3] Add integration test for scoped realtime delivery and
      reconnect reconciliation in
      test/integration/data-entry/review-kpi/sync.integration.test.ts
- [x] T041 [P] [US3] Add async-state integration coverage for save,
      recalculation, and comment failure paths in
      test/integration/data-entry/review-kpi/async-states.integration.test.tsx

### Implementation for User Story 3

- [x] T026 [US3] Implement optimistic concurrency edit mutation with updatedAt
      token checks in app/data-entry/review-kpi/actions.ts
- [x] T027 [US3] Implement input comment append mutation with validation and
      author stamping in app/data-entry/review-kpi/actions.ts
- [x] T028 [P] [US3] Implement PATCH input route contract in
      app/api/data-entry/review-kpi/inputs/[dataEntryId]/route.ts
- [x] T038 [US3] Add input-save pending, success, and validation failure states
      in components/data-entry/review-kpi-row.tsx
- [x] T039 [US3] Add recalculation pending and recalculation failure indicators
      in components/data-entry/review-kpi-row.tsx
- [x] T040 [US3] Add comment submit pending, retry, and failure states in
      components/data-entry/input-comment-thread.tsx
- [x] T029 [P] [US3] Implement POST input comment route contract in
      app/api/data-entry/review-kpi/inputs/[dataEntryId]/comments/route.ts
- [x] T030 [US3] Implement filter-scoped sync events endpoint in
      app/api/data-entry/review-kpi/events/route.ts
- [x] T031 [P] [US3] Build reusable comment thread component in
      components/data-entry/input-comment-thread.tsx
- [x] T032 [US3] Add editable input controls, conflict UI, and sync subscription
      handling in components/data-entry/review-kpi-row.tsx and
      app/data-entry/review-kpi/use-review-kpi-sync.ts
- [x] T033 [US3] Integrate save-to-recalculate flow with KPI worker trigger and
      refreshed result mapping in app/data-entry/review-kpi/service.ts

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: Polish and Cross-Cutting Concerns

**Purpose**: Final hardening, reuse cleanup, and validation evidence.

- [x] T034 [P] Consolidate repeated review-kpi input UI into reusable element in
      components/data-entry/review-kpi-input-value.tsx
- [x] T035 [P] Finalize accessibility labels, keyboard navigation, and
      live-region announcements in app/data-entry/review-kpi/page.tsx and
      components/data-entry/review-kpi-row.tsx
- [x] T036 Capture validation evidence by running npm run lint, npm run build,
      npm run test:unit, and npm run test:integration and recording outcomes in
      specs/005-review-kpi-values/validation.md

---

## Dependencies and Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies
- Foundational (Phase 2): depends on Setup and blocks all user stories
- User Stories (Phases 3-5): depend on Foundational completion
- Polish (Phase 6): depends on completion of required user stories

### User Story Dependencies

- US1 (P1): starts after Foundational and delivers MVP row rendering
- US2 (P2): starts after Foundational and can proceed in parallel with US1, but
  integrates cleanly with US1 page composition
- US3 (P3): starts after Foundational and depends on US1 row rendering plus US2
  active filter context wiring

### Within Each User Story

- Tests first and expected to fail before implementation
- Service/query and model mapping before endpoint wiring
- Endpoint wiring before UI integration
- Story must pass independent test criteria before next checkpoint

## Parallel Execution Examples

### User Story 1

- Run in parallel: T010 and T011
- Run in parallel: T013 and T014

### User Story 2

- Run in parallel: T017 and T018
- Run in parallel: T020 and T021

### User Story 3

- Run in parallel: T023, T024, and T025
- Run in parallel: T028, T029, and T031

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) only.
3. Validate US1 independently before expanding scope.

### Incremental Delivery

1. Deliver US1 (row rendering MVP).
2. Deliver US2 (filtering and cookie persistence).
3. Deliver US3 (edit, comments, realtime sync, conflict handling).
4. Finish Phase 6 hardening and full validation evidence.

### Team Parallel Strategy

1. One engineer focuses on service and route contracts.
2. One engineer focuses on UI composition and accessibility.
3. One engineer focuses on integration tests and sync/conflict scenarios.
4. Merge by story checkpoints to preserve independent testability.
