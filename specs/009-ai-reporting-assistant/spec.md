# Feature Specification: AI Reporting Assistant for PRISM

**Feature Branch**: `009-ai-reporting-assistant`  
**Created**: 2026-04-16  
**Status**: Draft  
**Input**: User description: "Build an authenticated AI assistant for PRISM data
queries and report-ready outputs with strict role-safe access controls and
auditable execution."

## Clarifications

### Session 2026-04-16

- Q: Which roles should have AI access at launch? → A: DEV, BMO, BLO, and CEO.
- Q: Which tool scope should phase one allow? → A: Any existing read-only
  service function.
- Q: What is the required AI query log retention period? → A: 90 days.
- Q: Are PDF/CSV exports mandatory in MVP? → A: Yes, PDF and CSV export are
  mandatory in MVP.
- Q: Is human review required before externally sharing AI-generated narrative
  reports? → A: Yes, human review is required.
- Q: Which roles can approve external sharing for AI-generated narrative
  reports? → A: DEV and BMO only.
- Q: Which roles can generate PDF and CSV exports in MVP? → A: All AI-enabled
  roles (DEV, BMO, BLO, CEO).
- Q: What happens to AI execution logs at the 90-day retention boundary? → A:
  Logs are permanently deleted at expiry in MVP.
- Q: Which context dimensions are required versus optional in MVP queries? → A:
  Prompt is always required; reportPeriodId is required for completeness,
  stale/missing KPI, and pending queue queries; serviceAreaId is optional and
  narrows scope when provided; sessionContextId is optional and required only
  for follow-up behavior.
- Q: What qualifies a service function for the phase-one read-only allowlist? →
  A: Only server-side functions that perform no create/update/delete, enforce
  role checks, return deterministic data, and are documented in the allowlist
  registry.
- Q: How should follow-up prompts behave when no session context is supplied? →
  A: Treat as a new query and return a user-safe clarification response when
  required context is missing.
- Q: How should ambiguous prompts be handled? → A: Ask one clarification when
  ambiguity spans multiple intents; otherwise apply a safe fallback intent and
  include a warning in the response.
- Q: How should stale or conflicting filter context be resolved? → A: Request
  payload values take precedence, then session context, then role-safe defaults;
  invalid values are dropped with a warning.
- Q: How should policy-bypass prompts be handled? → A: Block execution, return a
  forbidden-safe response, and log a POLICY_BYPASS failure type with trace id
  and selected guardrail.
- Q: What are measurable accessibility requirements for AI states? → A: All AI
  result and error regions must be keyboard reachable; status updates must use
  aria-live; export and review controls must have accessible names and visible
  focus indicators.
- Q: Which AI SDK and model strategy will be used in MVP? → A: Use Vercel AI SDK
  with OpenAI provider; GPT-5 as primary model and GPT-5-mini as fallback.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ask Operational Data Questions (Priority: P1)

As an authenticated data-entry or review user, I can ask natural-language
questions about scoped PRISM data and receive a trusted summary with supporting
rows.

**Why this priority**: This is the core user value and the main reason to add AI
reporting.

**Independent Test**: Can be fully tested by sending a valid prompt with filter
context and verifying the assistant returns role-safe summary text, metrics, and
supporting rows from approved sources.

**Acceptance Scenarios**:

1. **Given** an authenticated user with data-entry access, **When** they ask for
   completeness by report period and service area, **Then** the system returns a
   scoped summary and tabular evidence for only authorized data.
2. **Given** an authenticated user with review access, **When** they ask for
   stale or missing KPI review items, **Then** the system returns role-safe
   counts and rows with source attribution.

---

### User Story 2 - Enforce Role-Safe AI Access (Priority: P1)

As a platform owner, I need all AI responses to respect existing authorization
boundaries so no user can retrieve data outside their role scope.

**Why this priority**: Security and access control are non-negotiable for PRISM
reporting data.

**Independent Test**: Can be fully tested by running the same prompts as users
with different roles and verifying unauthorized data is denied and logged.

**Acceptance Scenarios**:

1. **Given** a user asks for data outside their permitted role scope, **When**
   the assistant evaluates the request, **Then** the system rejects forbidden
   access and returns a safe error message.
2. **Given** a user asks an allowed question, **When** approved tools execute,
   **Then** each tool call enforces authorization before data retrieval.

---

### User Story 3 - Generate Report-Ready Outputs (Priority: P2)

As a reporting user, I can generate narrative and structured report-ready
outputs from current context so ad hoc reporting takes less manual effort.

**Why this priority**: This turns insights into usable reporting deliverables.

**Independent Test**: Can be fully tested by asking for a monthly narrative
draft and validating that response structure includes summary, key metrics,
supporting rows, and generated PDF/CSV exports.

**Acceptance Scenarios**:

1. **Given** a valid reporting prompt with context, **When** the assistant
   responds, **Then** it includes summary text, key metrics, and structured
   supporting rows.
2. **Given** a user requests a report draft, **When** the response is created,
   **Then** the output includes report-ready content and supports immediate PDF
   and CSV export in MVP.

---

### User Story 4 - Audit AI Query Activity (Priority: P2)

As an admin or support owner, I can inspect AI query activity and outcomes for
incident review and governance.

**Why this priority**: Auditability is required for operational trust and
compliance.

**Independent Test**: Can be fully tested by executing representative prompts
and verifying logs include prompt metadata, execution trace, outcome status, and
timing details.

**Acceptance Scenarios**:

1. **Given** an AI query executes successfully, **When** execution completes,
   **Then** audit logs store trace id, tools used, timing, and outcome status.
2. **Given** an AI query fails due to validation, forbidden access, or timeout,
   **When** execution completes, **Then** logs capture failure type and trace id
   without exposing sensitive internals to end users.

---

### Edge Cases

- User asks for data outside their role scope.
- Prompt is ambiguous and can map to multiple approved tools.
- Client-supplied filter context is stale, conflicting, or partially invalid.
- Returned result set exceeds configured row limits.
- Downstream approved data service times out or partially fails.
- Prompt attempts policy bypass, privileged access, or write operations.
- No data exists for selected period/category/service area.
- User attempts external sharing of AI-generated narrative content before human
  review approval.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide an authenticated AI query interface that
  accepts a natural-language prompt and optional reporting filter context.
- **FR-002**: System MUST map user intents to existing read-only internal
  service functions in phase one and MUST NOT execute unrestricted
  model-generated SQL in this release.
- **FR-003**: System MUST enforce role-aware authorization before each approved
  tool execution and deny out-of-scope access attempts.
- **FR-004**: System MUST return a structured response containing summary text,
  key metrics, and supporting tabular rows.
- **FR-005**: System MUST include source attribution metadata for each response
  section that presents metrics or table results.
- **FR-006**: System MUST enforce guardrails including execution timeout,
  maximum row limits, and forbidden operation handling.
- **FR-007**: System MUST keep AI data interactions read-only and MUST block any
  write or mutation action requested through AI mode.
- **FR-008**: System MUST provide user-safe error messages for validation
  failures, forbidden access, timeout, downstream service failure, and no-data
  outcomes.
- **FR-009**: System MUST support follow-up prompts using the same session
  context when session context is supplied.
- **FR-010**: System MUST log each AI request with trace id, prompt metadata,
  selected tools, execution latency, outcome status, and failure type when
  applicable.
- **FR-011**: System MUST allow authorized administrators to review AI query
  logs for incident analysis and governance.
- **FR-012**: System MUST provide user-triggered PDF and CSV export generation
  in MVP for AI report outputs.
- **FR-013**: System MUST preserve alignment with existing PRISM data services
  as the source of truth for business logic and authorization.
- **FR-014**: Users MUST be able to ask at least these query classes in MVP:
  completeness summaries, review bottlenecks, stale/missing KPI items, and
  pending queue snapshots.
- **FR-015**: System MUST support explicit context-scoped reporting so outputs
  can be constrained by approved MVP filter dimensions: `reportPeriodId`
  (required for completeness, stale/missing KPI, pending queue), `serviceAreaId`
  (optional narrowing filter), and `sessionContextId` (optional follow-up
  context only). Additional dimensions MUST be introduced only via documented
  allowlist updates approved by DEV or BMO owners.
- **FR-016**: System MUST allow AI access at launch for DEV, BMO, BLO, and CEO
  roles, and deny AI access for all other roles unless expanded by a later
  approved change.
- **FR-017**: System MUST retain AI query execution logs for 90 days and allow
  authorized administrators to review retained logs within that period.
- **FR-018**: System MUST require human review approval before AI-generated
  narrative reports can be externally shared.
- **FR-019**: System MUST restrict narrative share approval actions to DEV and
  BMO roles, and deny approval attempts by other roles.
- **FR-020**: System MUST allow PDF and CSV export generation in MVP for all
  AI-enabled roles (DEV, BMO, BLO, CEO).
- **FR-021**: System MUST permanently delete AI query execution logs at the end
  of the 90-day retention period in MVP.
- **FR-022**: System MUST enforce MVP query context rules: prompt is required;
  `reportPeriodId` is required for completeness, stale/missing KPI, and pending
  queue queries; `serviceAreaId` is optional and narrows scope when supplied.
- **FR-023**: System MUST maintain a documented allowlist registry for phase-one
  read-only service functions, and each allowed function MUST be server-side,
  role-checked, deterministic, and free of create/update/delete behavior.
- **FR-024**: System MUST treat follow-up prompts without `sessionContextId` as
  new queries and return a clarification response when required context is
  missing.
- **FR-025**: System MUST resolve ambiguous prompts by either (a) returning one
  clarification question when multiple intents are equally plausible or (b)
  applying a safe fallback intent with a response warning.
- **FR-026**: System MUST resolve stale or conflicting context in this order:
  request payload values, then session context values, then role-safe defaults;
  invalid context values MUST be ignored and surfaced as warnings.
- **FR-027**: System MUST block policy-bypass attempts, return a user-safe
  forbidden response, and log failure type `POLICY_BYPASS` with trace id and
  guardrail metadata.
- **FR-028**: System MUST provide measurable accessibility behavior for AI
  states: keyboard access to all interactive controls, `aria-live` announcements
  for loading/success/error updates, and visible focus indicators on query,
  export, and review controls.
- **FR-029**: System MUST implement AI orchestration through the Vercel AI SDK
  with OpenAI provider, using GPT-5 as the primary model and GPT-5-mini as the
  fallback model for lower-cost or degraded-mode execution.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Every AI endpoint and approved tool call MUST enforce
  authentication and role-based authorization consistent with existing PRISM
  server-side access checks.
- **CA-002 Data Integrity**: AI execution is read-only for this release; logging
  entities added for AI request traces MUST use reviewed Drizzle schema changes
  and preserve deterministic reporting behavior.
- **CA-003 Validation**: Delivery evidence MUST include successful
  `npm run lint`, `npm run build`, and automated unit/integration tests for
  intent routing, authorization enforcement, response contract validation, and
  guardrail behavior.
- **CA-004 UX Accessibility**: AI UI surfaces MUST provide loading, empty,
  error, and success states; controls and result sections must be
  keyboard-operable and screen-reader readable, including `aria-live` status
  updates and visible focus indicators for all AI actions.
- **CA-005 UI Standards**: All AI UI additions MUST follow existing Tailwind and
  shadcn-compatible component patterns used across PRISM pages.
- **CA-006 Reuse**: Shared response rendering, status states, and source
  attribution UI/logic MUST be extracted into reusable components/services
  rather than duplicated across routes.

### Key Entities _(include if feature involves data)_

- **AI Query Request**: A user-initiated prompt payload including user identity,
  optional filter context, and session reference for follow-up queries.
- **AI Execution Trace**: Audit record for one AI request including trace id,
  selected tools, timing, outcome status, and error class when relevant.
- **Approved Data Tool**: A pre-approved server-side query function that
  retrieves role-scoped data from existing PRISM services.
- **AI Response Envelope**: Structured output containing summary text, key
  metrics, supporting rows, attribution metadata, and optional report payload
  fields.
- **AI Session Context**: Conversation-scoped context state allowing follow-up
  prompts to reuse previously selected reporting filters.

### Assumptions

- Existing PRISM APIs and services remain the source of truth for data access
  rules and business logic.
- Initial release remains read-only and excludes autonomous write actions.
- Vector search is optional and not required to deliver structured reporting
  capabilities in MVP.
- Power BI remains the deep-dive analytics surface while AI focuses on guided
  query summaries and report drafting.
- MVP AI access includes DEV, BMO, BLO, and CEO roles, with expansion controlled
  by follow-on governance decisions.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: At least 90% of pilot users obtain a correct first-pass answer to
  common PRISM reporting questions in under 30 seconds.
- **SC-002**: 100% of blocked authorization attempts are denied and captured in
  AI execution logs.
- **SC-003**: At least 95% of AI queries complete within 20 seconds (p95 <= 20s)
  under normal operating load.
- **SC-004**: Zero critical incidents of unauthorized data exposure occur in AI
  reporting flows during pilot rollout.
- **SC-005**: Pilot teams report at least a 50% reduction in manual ad hoc
  reporting effort for targeted workflows.
