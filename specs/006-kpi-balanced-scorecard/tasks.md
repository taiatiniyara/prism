# Tasks: KPI Balanced Scorecard

**Input**: Design documents from `/specs/006-kpi-balanced-scorecard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Automated tests are required because this feature changes business
behavior, authorization boundaries, and data transformation logic.

**Organization**: Tasks are grouped by user story for independent implementation
and validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare feature folders, shared types, and baseline test
scaffolding.

- [x] T001 Create scorecard module folders and barrel exports in
      app/data-entry/balanced-scorecard/index.ts
- [x] T002 Define scorecard request/response DTO types in
      app/data-entry/balanced-scorecard/types.ts
- [x] T003 [P] Create scorecard API query validator module in
      app/api/data-entry/balanced-scorecard/\_lib/validators.ts
- [x] T004 [P] Add scorecard test scaffolding files in
      test/unit/data-entry/balanced-scorecard/.gitkeep

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core server-side score computation and API plumbing required
by all user stories.

**⚠️ CRITICAL**: Complete this phase before user story implementation.

- [x] T005 Implement scorecard filter-context sanitization adapter in
      app/data-entry/balanced-scorecard/context.ts
- [x] T006 [P] Implement scorecard read-access guard in
      app/data-entry/balanced-scorecard/authz.ts
- [x] T007 [P] Implement KPI+BSC repository query and row normalization in
      app/data-entry/balanced-scorecard/repository.ts
- [x] T008 Implement weighted aggregation, dedupe, and exclusion engine in
      app/data-entry/balanced-scorecard/aggregator.ts
- [x] T009 Implement score snapshot response mapper in
      app/data-entry/balanced-scorecard/mapper.ts
- [x] T010 Implement authenticated GET route for scorecard retrieval in
      app/api/data-entry/balanced-scorecard/route.ts
- [x] T011 Add API contract alignment test for status codes and response schema
      in test/integration/api/data-entry/balanced-scorecard/contract.test.ts

**Checkpoint**: Foundation complete; user stories can now be implemented and
tested independently.

---

## Phase 3: User Story 1 - View scorecard performance summary (Priority: P1) 🎯 MVP

**Goal**: Provide balanced scorecard summary with perspective-level and overall
weighted scores.

**Independent Test**: Load a known KPI dataset and verify perspective totals,
status breakdowns, and overall score consistency.

### Tests for User Story 1

- [x] T012 [P] [US1] Add unit test for weighted perspective and overall score
      calculations in
      test/unit/data-entry/balanced-scorecard/aggregator.weighted.test.ts
- [x] T013 [P] [US1] Add unit test for latest-approved dedupe behavior in
      test/unit/data-entry/balanced-scorecard/aggregator.dedupe.test.ts
- [x] T014 [US1] Add integration test for successful scorecard summary response
      in test/integration/api/data-entry/balanced-scorecard/get-summary.test.ts

### Implementation for User Story 1

- [x] T015 [P] [US1] Implement scorecard orchestration service using repository
      and aggregator in app/data-entry/balanced-scorecard/service.ts
- [x] T016 [P] [US1] Create reusable scorecard summary cards component in
      components/data-entry/scorecard-summary.tsx
- [x] T017 [US1] Implement balanced scorecard page with loading/empty/error
      summary states in app/data-entry/balanced-scorecard/page.tsx
- [x] T018 [US1] Add scorecard navigation entry from data-entry landing page in
      app/data-entry/page.tsx
- [x] T019 [US1] Implement summary fetch client and view-model hydration in
      app/data-entry/balanced-scorecard/client.ts
- [x] T020 [US1] Add score/percentage/status formatting helpers in
      app/data-entry/balanced-scorecard/formatters.ts

**Checkpoint**: User Story 1 is independently functional and demo-ready.

---

## Phase 4: User Story 2 - Filter scorecard context (Priority: P2)

**Goal**: Ensure scorecard results always reflect current KPI table filter
context.

**Independent Test**: Apply filters individually and combined; verify scorecard
outputs match KPI-table-scoped totals and show explicit empty state when no rows
match.

### Tests for User Story 2

- [x] T021 [P] [US2] Add integration test for filter-context query handling and
      response parity in
      test/integration/api/data-entry/balanced-scorecard/get-filters.test.ts
- [x] T022 [P] [US2] Add unit test for invalid-row exclusion reason generation
      in test/unit/data-entry/balanced-scorecard/aggregator.exclusions.test.ts
- [x] T023 [US2] Add unit test for last-filter-wins stale-response handling in
      test/unit/data-entry/balanced-scorecard/client.last-filter-wins.test.ts

### Implementation for User Story 2

- [x] T024 [P] [US2] Implement scorecard filter controls reusing data-entry
      filter selectors in app/data-entry/balanced-scorecard/filters.client.tsx
- [x] T025 [US2] Extend scorecard service to apply report, service area,
      category, and subcategory filters in
      app/data-entry/balanced-scorecard/service.ts
- [x] T026 [US2] Implement request cancellation/ignore logic for stale responses
      in app/data-entry/balanced-scorecard/client.ts
- [x] T027 [US2] Wire filter-change refresh flow with latest-only rendering in
      app/data-entry/balanced-scorecard/page.tsx
- [x] T028 [US2] Add filter-driven explicit empty-state component in
      components/data-entry/scorecard-empty-state.tsx

**Checkpoint**: User Story 2 is independently functional with accurate context
filtering.

---

## Phase 5: User Story 3 - Investigate score drivers (Priority: P3)

**Goal**: Enable perspective drilldown to inspect contributing KPIs and
exclusion reasons.

**Independent Test**: Select a perspective and verify contributing KPI list,
contribution values, and excluded-record reason visibility.

### Tests for User Story 3

- [x] T029 [P] [US3] Add integration test for perspective drilldown payload
      including exclusions in
      test/integration/api/data-entry/balanced-scorecard/get-details.test.ts
- [x] T030 [P] [US3] Add component accessibility test for drilldown keyboard and
      labels in
      test/unit/data-entry/balanced-scorecard/scorecard-detail-panel.a11y.test.tsx

### Implementation for User Story 3

- [x] T031 [P] [US3] Create reusable perspective detail panel component in
      components/data-entry/scorecard-detail-panel.tsx
- [x] T032 [US3] Add perspective selection and drilldown state management in
      app/data-entry/balanced-scorecard/page.tsx
- [x] T033 [US3] Render excluded-record counts and reason list in drilldown
      panel in components/data-entry/scorecard-detail-panel.tsx
- [x] T034 [US3] Add reusable scorecard status badge component for
      on-track/at-risk/off-track in
      components/data-entry/scorecard-status-badge.tsx

**Checkpoint**: User Story 3 is independently functional with auditable
drilldown behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete hardening, reuse cleanup, and end-to-end validation
evidence.

- [x] T035 [P] Add deterministic scorecard fixture dataset for regression runs
      in test/fixtures/scorecard/valid-invalid-mixed.json
- [x] T036 Consolidate duplicated score presentation logic into shared helpers
      in app/data-entry/balanced-scorecard/formatters.ts
- [x] T037 Improve API error messaging consistency with review-kpi conventions
      in app/api/data-entry/balanced-scorecard/route.ts
- [x] T038 Run lint-driven cleanup across scorecard modules in
      app/data-entry/balanced-scorecard/page.tsx
- [x] T039 Run build/test stabilization updates for scorecard API and UI tests
      in test/integration/api/data-entry/balanced-scorecard/get-summary.test.ts
- [x] T040 [P] Update verification instructions and evidence checklist in
      specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T041 Run npm run lint and record output evidence in
      specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T042 Run npm run build and record output evidence in
      specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T043 Run npm run test:unit and record output evidence in
      specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T044 Run npm run test:integration and record output evidence in
      specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T045 Add performance verification test for summary load p95 <= 3s using
      representative dataset profile in
      test/integration/api/data-entry/balanced-scorecard/performance.get-summary.test.ts
- [ ] T046 Execute pilot usability validation (n>=10) for SC-003 and document
      results in specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T047 Define baseline and post-release measurement plan for SC-004
      reconciliation-time reduction in
      specs/006-kpi-balanced-scorecard/quickstart.md
- [x] T048 [P] Add forbidden-access integration test (authenticated but
      unauthorized role returns 403) in
      test/integration/api/data-entry/balanced-scorecard/get-forbidden.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2; defines MVP.
- **Phase 4 (US2)**: Depends on Phase 2; can run after or parallel to US1 once
  foundation is complete.
- **Phase 5 (US3)**: Depends on Phase 2; can run after or parallel to US1/US2
  once foundation is complete.
- **Phase 6 (Polish)**: Depends on completion of targeted user stories.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories.
- **US2 (P2)**: Reuses US1 modules but remains independently testable.
- **US3 (P3)**: Reuses summary/filter modules but remains independently
  testable.

### Within Each User Story

- Write tests first and confirm they fail before implementation.
- Implement service/data logic before UI wiring.
- Complete story-level checkpoint before moving on.

## Parallel Execution Examples

### User Story 1

- Run in parallel: T012 and T013 (independent unit tests).
- Run in parallel: T015 and T016 (service and summary component in separate
  files).

### User Story 2

- Run in parallel: T021 and T022 (integration and unit tests).
- Run in parallel: T024 and T026 (filter UI and client concurrency logic).

### User Story 3

- Run in parallel: T029 and T030 (integration and a11y tests).
- Run in parallel: T031 and T034 (detail panel and status badge components).

## Implementation Strategy

### MVP First (US1)

1. Finish Phase 1 and Phase 2.
2. Deliver Phase 3 (US1) completely.
3. Validate US1 independently and demo.

### Incremental Delivery

1. Foundation complete (Phases 1-2).
2. Deliver US1 and validate.
3. Deliver US2 and validate.
4. Deliver US3 and validate.
5. Finish polish tasks and collect validation evidence.

### Parallel Team Strategy

1. Team completes Setup and Foundational phases together.
2. After foundation:
   - Engineer A: US1 tasks.
   - Engineer B: US2 tasks.
   - Engineer C: US3 tasks.
3. Merge and verify each story independently before final polish.
