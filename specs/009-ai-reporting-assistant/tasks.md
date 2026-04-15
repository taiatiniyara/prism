# Tasks: AI Reporting Assistant for PRISM

**Input**: Design documents from `/specs/009-ai-reporting-assistant/`
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/, quickstart.md

**Tests**: Include automated tests because this feature changes business
behavior, authorization boundaries, and API contracts.

**Organization**: Tasks are grouped by user story so each story can be
implemented and validated independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize AI SDK and project scaffolding.

- [x] T001 Add Vercel AI SDK and OpenAI provider dependencies in `package.json`
- [x] T002 Add AI model and provider environment variables to `.env.example`
- [x] T003 [P] Create AI module scaffolding in `lib/ai/index.ts`
- [x] T004 [P] Create base AI shared types in `lib/ai/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core foundations required by all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Define AI reporting schema entities in `db/schema/ai-reporting.ts`
- [x] T006 Create database migration for AI reporting entities in
      `db/migrations/`
- [x] T007 Implement trace persistence service skeleton in
      `lib/ai/trace-log.service.ts`
- [x] T008 [P] Implement read-only service allowlist registry in
      `lib/ai/allowed-read-services.ts`
- [x] T009 [P] Implement guardrail policy utilities in `lib/ai/guardrails.ts`
- [x] T010 [P] Implement response contract validators in
      `lib/ai/response-contract.ts`
- [x] T011 Implement intent routing foundation in `lib/ai/intent-router.ts`
- [x] T012 Implement launch role access policy helpers in
      `lib/ai/access-policy.ts`
- [x] T013 Implement AI-safe error mapping utilities in `lib/ai/error-mapper.ts`

**Checkpoint**: Foundation complete. User story implementation can now begin.

---

## Phase 3: User Story 1 - Ask Operational Data Questions (Priority: P1) 🎯 MVP

**Goal**: Allow AI-enabled users to run scoped natural-language queries and
receive summary + metrics + rows + attribution.

**Independent Test**: Submit valid prompts for required query classes and verify
structured responses are returned using authorized data only.

### Tests for User Story 1

- [x] T014 [P] [US1] Add unit tests for intent classification and context rules
      in `test/unit/ai/intent-router.test.ts`
- [x] T014A [P] [US1] Add unit test for model fallback trigger policy (GPT-5 ->
      GPT-5-mini) in `test/unit/ai/model-fallback-policy.test.ts`
- [x] T015 [P] [US1] Add integration test for successful AI query response
      envelope in `test/integration/api/ai/query.success.test.ts`

### Implementation for User Story 1

- [x] T016 [US1] Implement AI query API route in `app/api/ai/query/route.ts`
- [x] T017 [US1] Implement query orchestration service in
      `lib/ai/query.service.ts`
- [x] T018 [US1] Implement query-class mapping for MVP classes in
      `lib/ai/query-class-map.ts`
- [x] T019 [US1] Create AI assistant page in
      `app/dashboard/ai-assistant/page.tsx`
- [x] T020 [P] [US1] Implement assistant input/status UI in
      `components/ai/assistant-panel.tsx`
- [x] T021 [P] [US1] Implement summary renderer in
      `components/ai/response-summary.tsx`
- [x] T022 [P] [US1] Implement metrics/rows renderer in
      `components/ai/response-metrics-table.tsx`
- [x] T023 [P] [US1] Implement attribution renderer in
      `components/ai/response-source-attribution.tsx`
- [x] T024 [US1] Implement follow-up-without-context clarification handling in
      `lib/ai/query.service.ts`

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Enforce Role-Safe AI Access (Priority: P1)

**Goal**: Enforce strict role authorization, guardrails, ambiguity handling,
context precedence, and safe error behavior.

**Independent Test**: Execute prompts across allowed and disallowed roles,
policy-bypass prompts, and conflicting context payloads to confirm enforcement
and logging behavior.

### Tests for User Story 2

- [x] T025 [P] [US2] Add integration test for disallowed role rejection in
      `test/integration/api/ai/query.forbidden-role.test.ts`
- [x] T026 [P] [US2] Add integration test for policy-bypass rejection and
      logging in `test/integration/api/ai/query.policy-bypass.test.ts`
- [x] T026A [P] [US2] Add accessibility integration test for keyboard traversal
      and visible focus indicators in
      `test/integration/ai/assistant-keyboard-accessibility.test.tsx`
- [x] T026B [P] [US2] Add accessibility integration test for `aria-live`
      loading/success/error announcements in
      `test/integration/ai/assistant-aria-live.test.tsx`

### Implementation for User Story 2

- [x] T027 [US2] Enforce launch-role and tool-level authorization in
      `lib/ai/access-policy.ts`
- [x] T028 [US2] Implement context precedence and invalid-value warning logic in
      `lib/ai/context-resolution.ts`
- [x] T029 [US2] Implement ambiguity clarification/fallback flow in
      `lib/ai/intent-router.ts`
- [x] T030 [US2] Implement policy-bypass blocking and failure tagging in
      `lib/ai/guardrails.ts`
- [x] T031 [US2] Wire safe error response shaping in `app/api/ai/query/route.ts`
- [x] T032 [US2] Add keyboard/aria-live/focus behavior to assistant UI in
      `components/ai/assistant-panel.tsx`

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 - Generate Report-Ready Outputs (Priority: P2)

**Goal**: Provide mandatory MVP PDF/CSV export and narrative share-review
gating.

**Independent Test**: Generate PDF and CSV outputs from successful trace IDs and
verify external narrative sharing is blocked until approved.

### Tests for User Story 3

- [x] T033 [P] [US3] Add integration test for PDF and CSV export generation in
      `test/integration/api/ai/exports.test.ts`
- [x] T034 [P] [US3] Add integration test for narrative share approval gating in
      `test/integration/api/ai/share-review.test.ts`

### Implementation for User Story 3

- [x] T035 [US3] Implement export API route in `app/api/ai/exports/route.ts`
- [x] T036 [US3] Implement PDF/CSV generation service in
      `lib/ai/export.service.ts`
- [x] T037 [US3] Implement export action controls in
      `components/ai/export-actions.tsx`
- [x] T038 [US3] Implement narrative review API route in
      `app/api/ai/reports/[reportId]/share/route.ts`
- [x] T039 [US3] Implement narrative review service with DEV/BMO approval
      restriction in `lib/ai/narrative-review.service.ts`
- [x] T040 [US3] Surface review-state messaging in
      `components/ai/assistant-panel.tsx`

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: User Story 4 - Audit AI Query Activity (Priority: P2)

**Goal**: Provide auditable traces with admin review capability and retention
expiry behavior.

**Independent Test**: Verify trace records are created for all query outcomes,
admin review endpoint is role-protected, and retention expiry deletes records.

### Tests for User Story 4

- [x] T041 [P] [US4] Add unit test for retention expiry policy in
      `test/unit/ai/trace-log-retention.test.ts`
- [x] T042 [P] [US4] Add integration test for admin trace review endpoint in
      `test/integration/api/ai/traces.admin.test.ts`

### Implementation for User Story 4

- [x] T043 [US4] Implement query/trace/review persistence operations in
      `lib/ai/trace-log.service.ts`
- [x] T044 [US4] Implement admin trace listing API route in
      `app/api/ai/traces/route.ts`
- [x] T045 [US4] Implement 90-day trace deletion job in
      `scripts/ai-trace-retention.ts`
- [x] T046 [US4] Implement admin trace review UI page in
      `app/settings/reporting/ai-traces/page.tsx`
- [x] T047 [US4] Surface trace IDs in response UI for support workflows in
      `components/ai/assistant-panel.tsx`

**Checkpoint**: User Story 4 is independently functional and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality hardening and delivery readiness checks.

- [x] T048 [P] Document AI reporting usage and governance in `app/docs/page.tsx`
- [x] T049 [P] Consolidate repeated AI UI styles/behavior in `components/ai/`
- [x] T050 Validate quickstart scenarios and update notes in
      `specs/009-ai-reporting-assistant/quickstart.md`
- [x] T051 Run lint validation and record output in
      `specs/009-ai-reporting-assistant/quickstart.md`
- [x] T052 Run build validation and record output in
      `specs/009-ai-reporting-assistant/quickstart.md`
- [x] T053 Run unit/integration tests and record output in
      `specs/009-ai-reporting-assistant/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies.
- Foundational (Phase 2): depends on Setup; blocks all user stories.
- User Stories (Phases 3-6): depend on Foundational completion.
- Polish (Phase 7): depends on completion of selected user stories.

### User Story Dependencies

- US1 (P1): starts after Phase 2; establishes MVP query path.
- US2 (P1): starts after Phase 2; can run in parallel with US1 but must merge
  before release.
- US3 (P2): depends on US1 query output and trace IDs.
- US4 (P2): depends on foundational persistence and should integrate after
  US1/US2 route behavior stabilizes.

### Within Each User Story

- Tests are written before implementation and must fail first.
- API/service behavior is implemented before UI integration.
- Story checkpoints confirm independent testability before progressing.

## Parallel Execution Examples

### User Story 1

- Run T014, T014A, and T015 in parallel.
- Run T020, T021, T022, and T023 in parallel after T016/T017 are stable.

### User Story 2

- Run T025 and T026 in parallel.
- Run T028, T029, and T030 in parallel, then integrate through T031.

### User Story 3

- Run T033 and T034 in parallel.
- Run T036 and T037 in parallel after T035 route contract is in place.

### User Story 4

- Run T041 and T042 in parallel.
- Run T044 and T045 in parallel once T043 persistence service is ready.

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phases 1 and 2.
2. Deliver US1 and US2 for secure, role-scoped AI querying.
3. Validate with independent tests before moving to exports and audit UX.

### Incremental Delivery

1. Add US3 for mandatory PDF/CSV exports and review gating.
2. Add US4 for admin audit workflows and retention operations.
3. Complete Phase 7 polish and validation.

### Team Parallelization

1. After Phase 2, one stream handles US1 query/UX while another handles US2
   guardrails.
2. Export/review stream (US3) starts once trace/output contracts stabilize.
3. Audit stream (US4) proceeds with persistence and admin surfaces.
