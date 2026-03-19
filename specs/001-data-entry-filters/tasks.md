# Tasks: Data Entry Filters and Context

**Input**: Design documents from `/specs/001-data-entry-filters/`
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/, quickstart.md

**Tests**: Include automated test tasks because this feature changes business
behavior, authorization-scoped filtering, and integration boundaries.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize test and feature scaffolding required across all user
stories.

- [x] T001 Add test scripts for unit/component/integration runs in package.json
- [x] T002 Add Vitest configuration for Next.js + TypeScript in vitest.config.ts
- [x] T003 [P] Add test setup for DOM matchers and runtime hooks in
      test/setup.ts
- [x] T004 [P] Create data-entry test fixture builders for filter context and
      options in test/fixtures/data-entry-filters.ts
- [x] T005 [P] Create feature constants for cookie keys and context defaults in
      app/data-entry/constants.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared domain and infrastructure required before user story
implementation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Define filter domain types and view-model interfaces in
      app/data-entry/types.ts
- [x] T007 Implement cookie read/write/sanitize utility for filter context in
      app/data-entry/filterContext.cookies.ts
- [x] T008 Implement base authorization-scoped option loaders for report
      types/periods/categories/subcategories/service areas in
      app/data-entry/enter-data/service.ts
- [x] T009 Implement deterministic cascade reset helper for upstream/downstream
      filter transitions in app/data-entry/filterContext.rules.ts
- [x] T010 Implement control-type mapper from `dataTypeId` to renderer types in
      app/data-entry/inputControlType.mapper.ts
- [x] T011 [P] Create shared selector component wrappers (report type, report
      period, category, subcategory, service area) in
      components/data-entry/filterSelectors.tsx
- [x] T012 [P] Create shared loading/empty/error state component for data-entry
      filters and rows in components/data-entry/filterStatePanel.tsx

**Checkpoint**: Foundation ready; user story phases can proceed.

---

## Phase 3: User Story 1 - Persist and Reuse Entry Context (Priority: P1) 🎯 MVP

**Goal**: Persist report type, report period, category, subcategory, and service
area context in cookies and restore valid context on revisit.

**Independent Test**: Select all filters, refresh/re-enter page, and verify
valid selections are restored; stale cookie values are sanitized.

### Tests for User Story 1

- [x] T013 [P] [US1] Add unit tests for cookie parse/sanitize/default behavior
      in test/unit/data-entry/filterContext.cookies.test.ts
- [x] T014 [P] [US1] Add integration tests for revisit persistence and
      stale-cookie recovery in
      test/integration/data-entry/filterContext.persistence.test.ts

### Implementation for User Story 1

- [x] T015 [US1] Implement context bootstrap and cookie persistence service in
      app/data-entry/enter-data/services/us1.contextPersistence.service.ts
- [x] T016 [US1] Implement cookie update actions for each filter dimension in
      app/data-entry/enter-data/service.ts
- [x] T017 [US1] Implement top-level data-entry page model assembly using
      validated context in app/data-entry/enter-data/service.ts
- [x] T018 [US1] Replace placeholder enter-data route with server-driven context
      bootstrapping in app/data-entry/enter-data/page.tsx
- [x] T019 [US1] Implement client filter header wired to cookie-backed context
      updates in app/data-entry/enter-data/filters.client.tsx
- [x] T020 [US1] Integrate filter header into enter-data page and preserve
      current context across refreshes in app/data-entry/enter-data/page.tsx
- [x] T021 [US1] Add unauthorized/invalid context guard handling for option
      loading in app/data-entry/enter-data/service.ts

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Cascading Filter Selection (Priority: P2)

**Goal**: Apply cascading filter behavior so category/subcategory changes always
produce valid downstream options and filtered input rows.

**Independent Test**: Change upstream filters and verify downstream options and
rows reset/update immediately with no invalid combinations.

### Tests for User Story 2

- [x] T022 [P] [US2] Add unit tests for cascade reset rule engine in
      test/unit/data-entry/filterContext.rules.test.ts
- [x] T023 [P] [US2] Add integration tests for category/subcategory cascade and
      row filtering in
      test/integration/data-entry/filterCascade.behavior.test.ts

### Implementation for User Story 2

- [x] T024 [US2] Implement cascade filtering service for category/subcategory
      option shaping in
      app/data-entry/enter-data/services/us2.cascadeFiltering.service.ts
- [x] T025 [US2] Implement subcategory-scoped input definition filtering in
      app/data-entry/enter-data/service.ts
- [x] T026 [US2] Implement cascade application during filter-change actions in
      app/data-entry/enter-data/service.ts
- [x] T027 [US2] Implement client-side selector reset UX after upstream changes
      in app/data-entry/enter-data/filters.client.tsx
- [x] T028 [US2] Implement no-results empty state for valid filter combinations
      in app/data-entry/enter-data/inputRows.tsx
- [x] T029 [US2] Ensure unknown `dataTypeId` uses fallback control rendering in
      app/data-entry/enter-data/inputCell.tsx

**Checkpoint**: User Stories 1 and 2 are independently functional and testable.

---

## Phase 5: User Story 3 - Operational and Generation-Specific Views (Priority: P3)

**Goal**: Show service area selector only for Operational category and show
generator-grouped non-virtual resources for Generation subcategory.

**Independent Test**: Toggle categories/subcategories and verify selector
visibility and generator-grouped input rendering obeys business rules.

### Tests for User Story 3

- [x] T030 [P] [US3] Add unit tests for Operational visibility and Generation
      mode flags in test/unit/data-entry/filterContext.conditionalModes.test.ts
- [x] T031 [P] [US3] Add integration tests for Generation grouping
      (non-virtual + service-area scoped) in
      test/integration/data-entry/generationGrouping.behavior.test.ts
- [x] T047 [P] [US3] Add integration test for option-loading failure and
      user-visible error state in
      test/integration/data-entry/filterOptions.failureState.test.ts
- [x] T048 [P] [US3] Add integration test for unauthorized stale cookie IDs and
      sanitization behavior in
      test/integration/data-entry/filterOptions.authorizationFailure.test.ts

### Implementation for User Story 3

- [x] T032 [US3] Implement operational and generation mode service in
      app/data-entry/enter-data/services/us3.conditionalViews.service.ts
- [x] T033 [US3] Implement Generation-mode resource query with
      `is_virtual = false` and service area filtering in
      app/data-entry/enter-data/service.ts
- [x] T034 [US3] Implement grouped-by-generator view model assembly in
      app/data-entry/enter-data/service.ts
- [x] T035 [US3] Implement grouped generator section renderer for Generation
      mode in app/data-entry/enter-data/generatorGroups.tsx
- [x] T036 [US3] Wire conditional section rendering (flat vs grouped,
      service-area selector visibility) in app/data-entry/enter-data/page.tsx

**Checkpoint**: All user stories are independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete validation, accessibility, and documentation across all
stories.

- [ ] T037 [P] Add accessibility labels, keyboard order checks, and aria
      descriptions for all selectors in
      app/data-entry/enter-data/filters.client.tsx
- [ ] T038 [P] Add unified loading/error/empty handling coverage in enter-data
      page composition in app/data-entry/enter-data/page.tsx
- [ ] T039 Update feature documentation with final behavior notes and validation
      evidence in specs/001-data-entry-filters/quickstart.md
- [ ] T040 Run lint validation and capture outcomes in
      specs/001-data-entry-filters/quickstart.md
- [ ] T041 Run build validation and capture outcomes in
      specs/001-data-entry-filters/quickstart.md
- [ ] T042 Run automated test suite and capture outcomes in
      specs/001-data-entry-filters/quickstart.md
- [ ] T043 [P] Add performance test for filter-change latency p95 <= 2s in
      test/performance/data-entry/filterLatency.performance.test.ts
- [ ] T044 Record SC-002 performance evidence and pass/fail thresholds in
      specs/001-data-entry-filters/quickstart.md
- [ ] T045 Define and execute first-attempt completion validation protocol in
      specs/001-data-entry-filters/validation/usability-protocol.md
- [ ] T046 Capture SC-003 completion-rate outcome evidence in
      specs/001-data-entry-filters/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion.
- **Phase 4 (US2)**: Depends on Phase 2 completion; can proceed after US1 starts
  but should merge after US1 base context wiring.
- **Phase 5 (US3)**: Depends on Phase 2 completion and uses filter/cascade
  primitives from US1/US2.
- **Phase 6 (Polish)**: Depends on completion of target user stories.

### User Story Dependencies

- **US1 (P1)**: Independent after foundational work; defines MVP.
- **US2 (P2)**: Independent business value after foundational work; relies on
  shared context framework from Phase 2.
- **US3 (P3)**: Independent conditional-view value after foundational work;
  reuses context and cascade behavior.

### Within Each User Story

- Tests first and expected to fail before implementation.
- Service/domain logic before UI wiring.
- UI integration before polish checks.
- Story must satisfy its independent test before moving to next priority.
- Shared orchestration sequencing: complete US1 orchestration in
  `app/data-entry/enter-data/service.ts` and
  `app/data-entry/enter-data/page.tsx` before US2 changes to those files, and
  complete US2 orchestration before US3 orchestration updates.

## Parallel Opportunities

- Phase 1 parallel tasks: T003, T004, T005.
- Phase 2 parallel tasks: T011, T012 after T006-T010 begin.
- US1 parallel tasks: T013 and T014.
- US2 parallel tasks: T022 and T023.
- US3 parallel tasks: T030, T031, T047, and T048.
- Polish parallel tasks: T037, T038, and T043.

## Parallel Example: User Story 1

```bash
# Run US1 tests in parallel workstreams:
Task: T013 test/unit/data-entry/filterContext.cookies.test.ts
Task: T014 test/integration/data-entry/filterContext.persistence.test.ts

# Parallel UI/shared setup for US1 after core service wiring:
Task: T019 app/data-entry/enter-data/filters.client.tsx
Task: T020 app/data-entry/enter-data/page.tsx
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational).
3. Complete Phase 3 (US1).
4. Validate US1 independent test and acceptance scenarios.
5. Demo/deploy MVP slice.

### Incremental Delivery

1. Ship US1 persistence and restore behavior.
2. Add US2 cascade correctness and invalid-combination prevention.
3. Add US3 Operational/Generation conditional views.
4. Complete Phase 6 validation and accessibility pass.

### Parallel Team Strategy

1. Team completes Phase 1 and 2 together.
2. Developer A drives US1 service and cookie behavior.
3. Developer B drives US2 cascade logic and tests.
4. Developer C drives US3 generation grouping and UI.
5. Merge and run Phase 6 as shared hardening.

## Notes

- [P] tasks touch different files and avoid blocking dependencies.
- Story labels map each task to a specific user story for traceability.
- Keep business rules in server-side services and keep UI rendering-focused.
- Capture command outcomes directly in quickstart to preserve delivery evidence.
