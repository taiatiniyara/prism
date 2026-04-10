# Tasks: Custom KPI Review Workflow

**Input**: Design documents from `/specs/008-review-custom-kpi/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/custom-kpi-review.openapi.yaml

**Tests**: Automated tests are required for this feature because it changes
business behavior, authorization, data workflows, and integration boundaries.

**Organization**: Tasks are grouped by user story so each story can be
implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create feature scaffolding and shared validation modules.

- [x] T001 Create custom KPI API route folder structure in
      app/api/data-entry/custom-kpi/
- [x] T002 Create custom KPI UI page scaffold in
      app/data-entry/custom-kpi/page.tsx
- [x] T003 [P] Create custom KPI request form component scaffold in
      components/data-entry/custom-kpi-request-form.tsx
- [x] T004 [P] Create custom KPI status badge component scaffold in
      components/data-entry/custom-kpi-request-status-badge.tsx
- [x] T005 [P] Create request validator module in
      app/api/data-entry/custom-kpi/\_lib/validators.ts
- [x] T006 [P] Create decision validator module in
      app/api/data-entry/custom-kpi/requests/[requestId]/decision/\_lib/validators.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared persistence, domain model, and guardrails used by all
user stories.

**CRITICAL**: Complete this phase before user story implementation.

- [x] T007 Add custom KPI schema models and enums in
      db/schema/custom-kpi-requests.ts
- [x] T008 Wire custom KPI schema exports in db/schema/index.ts
- [x] T009 Create Drizzle migration for custom KPI lifecycle tables in
      db/migrations/
- [x] T010 Implement shared custom KPI repository/service base in
      app/data-entry/custom-kpi/service.ts
- [x] T011 [P] Implement reviewer role guard helpers for custom KPI flows in
      app/data-entry/review-kpi/service.ts
- [x] T012 [P] Implement shared lifecycle event recording helper in
      app/data-entry/custom-kpi/service.ts
- [x] T013 [P] Implement shared duplicate-pending detection helper in
      app/data-entry/custom-kpi/service.ts
- [x] T014 [P] Add unit tests for state transition rules in
      test/unit/custom-kpi/state-transitions.test.ts
- [x] T015 [P] Add unit tests for duplicate detection normalization in
      test/unit/custom-kpi/duplicate-detection.test.ts

**Checkpoint**: Foundation ready for independent user story delivery.

---

## Phase 3: User Story 1 - Submit custom KPI for review (Priority: P1) 🎯 MVP

**Goal**: Allow eligible users to submit a custom KPI request and view their own
request status history.

**Independent Test**: Submitter can create a request and retrieve their own
requests with Pending Review status and timestamps.

### Tests for User Story 1

- [x] T016 [P] [US1] Add POST request contract test for
      /api/data-entry/custom-kpi/requests in
      test/integration/api/custom-kpi/create-request.contract.test.ts
- [x] T017 [P] [US1] Add GET mine-list integration test for
      /api/data-entry/custom-kpi/requests in
      test/integration/api/custom-kpi/list-my-requests.integration.test.ts
- [x] T018 [P] [US1] Add service unit test for submit-request authorization and
      validation in test/unit/custom-kpi/submit-request.service.test.ts

### Implementation for User Story 1

- [x] T019 [US1] Implement submit request service flow and pending status
      persistence in app/data-entry/custom-kpi/service.ts
- [x] T020 [US1] Implement request listing service flow for submitter history in
      app/data-entry/custom-kpi/service.ts
- [x] T021 [US1] Implement POST and GET route handlers for
      /api/data-entry/custom-kpi/requests in
      app/api/data-entry/custom-kpi/requests/route.ts
- [x] T022 [US1] Implement request payload parsing and validation in
      app/api/data-entry/custom-kpi/\_lib/validators.ts
- [x] T023 [US1] Implement submitter custom KPI page data loader and actions in
      app/data-entry/custom-kpi/page.tsx
- [x] T024 [P] [US1] Implement request form UI with accessible validation states
      in components/data-entry/custom-kpi-request-form.tsx
- [x] T025 [P] [US1] Implement request status badge rendering for
      pending/terminal states in
      components/data-entry/custom-kpi-request-status-badge.tsx

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - DEV review and decision (Priority: P1)

**Goal**: Enable DEV reviewers to approve, reject, replace, override, and
promote custom KPI requests with full authorization and auditability.

**Independent Test**: DEV reviewer can apply each decision path and promotion
action; unauthorized users are blocked; audit/event history is recorded.

### Tests for User Story 2

- [x] T026 [P] [US2] Add decision endpoint contract test for
      /api/data-entry/custom-kpi/requests/{requestId}/decision in
      test/integration/api/custom-kpi/decision.contract.test.ts
- [x] T027 [P] [US2] Add promotion endpoint contract test for
      /api/data-entry/custom-kpi/requests/{requestId}/promotion in
      test/integration/api/custom-kpi/promotion.contract.test.ts
- [x] T028 [P] [US2] Add integration test for replace decision requiring
      replacementKpiId and rationale in
      test/integration/api/custom-kpi/replace-decision.integration.test.ts
- [x] T029 [P] [US2] Add unit tests for override authorization and lineage in
      test/unit/review/override-decision.service.test.ts
- [x] T030 [P] [US2] Add unit tests for submitter-only to global promotion
      transition in test/unit/review/promotion.service.test.ts

### Implementation for User Story 2

- [x] T031 [US2] Implement reviewer decision service flow
      (approve/reject/replace) in app/data-entry/review-kpi/service.ts
- [x] T032 [US2] Implement override decision flow and prior-decision linkage in
      app/data-entry/review-kpi/service.ts
- [x] T033 [US2] Implement promotion flow from SUBMITTER_ONLY to GLOBAL in
      app/data-entry/review-kpi/service.ts
- [x] T034 [US2] Implement decision route handler in
      app/api/data-entry/custom-kpi/requests/[requestId]/decision/route.ts
- [x] T035 [US2] Implement promotion route handler in
      app/api/data-entry/custom-kpi/requests/[requestId]/promotion/route.ts
- [x] T036 [US2] Implement decision payload validator and conflict validation in
      app/api/data-entry/custom-kpi/requests/[requestId]/decision/\_lib/validators.ts
- [x] T037 [P] [US2] Implement reviewer action panel component for
      approve/reject/replace/override in
      components/data-entry/custom-kpi-review-actions.tsx
- [x] T038 [US2] Integrate reviewer actions and queue state handling in
      app/data-entry/review-kpi/page.tsx

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 - Email submitter review outcome (Priority: P2)

**Goal**: Send outcome emails after final decisions with retry tracking while
preserving decision integrity on delivery failure.

**Independent Test**: Finalized decision triggers email delivery attempt
tracking; failure marks retryable/final states without reverting decision
status.

### Tests for User Story 3

- [x] T039 [P] [US3] Add integration test for decision-triggered email enqueue
      in test/integration/api/custom-kpi/decision-email.integration.test.ts
- [x] T040 [P] [US3] Add unit tests for email retry state transitions in
      test/unit/custom-kpi/email-delivery-retry.service.test.ts
- [x] T041 [P] [US3] Add unit tests for email payload composition by decision
      type in test/unit/custom-kpi/email-payload.service.test.ts

### Implementation for User Story 3

- [x] T042 [US3] Implement decision outcome email orchestration and delivery
      tracking in app/data-entry/custom-kpi/service.ts
- [x] T043 [US3] Implement email retry scheduling and status updates in
      app/data-entry/custom-kpi/service.ts
- [x] T044 [US3] Add custom KPI review outcome email template helper in
      lib/email.service.ts
- [x] T045 [US3] Record email dispatched/failed lifecycle events in
      app/data-entry/custom-kpi/service.ts
- [x] T046 [US3] Expose retry processing route for pending email deliveries in
      app/api/data-entry/custom-kpi/email-retries/route.ts

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consolidate quality, observability, and documentation across
stories.

- [x] T047 [P] Document custom KPI workflow API and operational notes in
      docs/page.tsx
- [x] T048 Add queue-latency metric instrumentation for SC-001 in
      app/data-entry/custom-kpi/service.ts
- [x] T049 Add decision-cycle-time metric instrumentation for SC-002 in
      app/data-entry/review-kpi/service.ts
- [x] T050 Add email-dispatch-latency metric instrumentation for SC-003 in
      app/data-entry/custom-kpi/service.ts
- [x] T051 [P] Refactor duplicate UI status presentation into shared reusable
      component logic in
      components/data-entry/custom-kpi-request-status-badge.tsx
- [x] T052 Run lint validation command and capture output notes in
      specs/008-review-custom-kpi/quickstart.md
- [x] T053 Run build validation command and capture output notes in
      specs/008-review-custom-kpi/quickstart.md
- [x] T054 Run unit and integration test suites and capture output notes in
      specs/008-review-custom-kpi/quickstart.md
- [x] T055 [US1] Add loading, empty, error, and success states for submitter
      request list interactions in app/data-entry/custom-kpi/page.tsx
- [x] T056 [US2] Add loading, empty, error, and success states for reviewer
      queue and decision submission in app/data-entry/review-kpi/page.tsx
- [x] T057 [US2] Add keyboard and screen-reader validation for decision controls
      in components/data-entry/custom-kpi-review-actions.tsx
- [x] T058 Capture pre-rollout baseline duplicate-pending rate and measurement
      method in specs/008-review-custom-kpi/quickstart.md
- [x] T059 Define and run post-rollout duplicate-rate comparison for SC-005 in
      specs/008-review-custom-kpi/quickstart.md
- [x] T060 Define and run SC-001 threshold verification report for pending queue
      visibility within 1 minute in specs/008-review-custom-kpi/quickstart.md
- [x] T061 Define and run SC-002 threshold verification report for decision
      completion within 2 business days in
      specs/008-review-custom-kpi/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): No dependencies.
- Foundational (Phase 2): Depends on Setup and blocks all user stories.
- User Stories (Phases 3-5): Depend on Foundational completion.
- Polish (Phase 6): Depends on desired user stories being complete.

### User Story Dependencies

- US1: Depends only on Foundational completion.
- US2: Depends only on Foundational completion and can be tested with seeded
  pending requests.
- US3: Depends on US2 decision flows because email is triggered from final
  decisions.

### Within Each User Story

- Tests are authored before implementation and should fail before code changes.
- Service logic precedes route integration.
- Route integration precedes UI interaction wiring.

### Parallel Opportunities

- Setup tasks T003-T006 can run in parallel.
- Foundational tasks T011-T015 can run in parallel after schema baseline tasks.
- US1 tests T016-T018 can run in parallel.
- US2 tests T026-T030 can run in parallel.
- US3 tests T039-T041 can run in parallel.
- Polish tasks T047 and T051 can run in parallel with validation preparation.

---

## Parallel Example: User Story 1

```bash
# Parallel test work
T016 / T017 / T018

# Parallel UI work after service endpoints exist
T024 / T025
```

## Parallel Example: User Story 2

```bash
# Parallel test work
T026 / T027 / T028 / T029 / T030

# Parallel implementation work after core decision services
T034 / T035 / T037
```

## Parallel Example: User Story 3

```bash
# Parallel test work
T039 / T040 / T041

# Parallel implementation work after email orchestration baseline
T044 / T045 / T046
```

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and Phase 2.
2. Deliver Phase 3 (US1) and validate independently.
3. Demo pending request submission and submitter request history.

### Incremental Delivery

1. Add US2 for reviewer governance (decisions, overrides, promotion).
2. Add US3 for email outcome delivery reliability.
3. Complete Phase 6 to finalize observability and validation evidence.

### Parallel Team Strategy

1. Team A: Data model and foundational service abstractions.
2. Team B: US1 submitter flow once foundational checkpoint is complete.
3. Team C: US2 reviewer flow in parallel with US1 UI finishing.
4. Team D: US3 email delivery and retry flow after US2 decision hooks exist.
