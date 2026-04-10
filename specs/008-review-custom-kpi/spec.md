# Feature Specification: Custom KPI Review Workflow

**Feature Branch**: `008-review-custom-kpi`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "When use user enters a new custom KPI, it needs to
be reviewed by a DEV user to check if it can be replaced by an existing KPI, if
it will be approved or rejected, and the user will be notified on the review
result."

## Clarifications

### Session 2026-04-10

- Q: For custom KPI duplicate handling, what should define "can be replaced by
  an existing KPI"? → A: DEV reviewer manually selects replacement KPI and must
  provide rationale.
- Q: Which notification channel should be required for review outcomes? → A:
  Email notification only.
- Q: After a DEV reviewer approves a custom KPI, what should happen next? → A:
  KPI is active only for submitter until global promotion.
- Q: Who is allowed to override a finalized review decision? → A: Any DEV
  reviewer.
- Q: For submitter-only approved KPIs, who can perform the global promotion
  step? → A: Any DEV reviewer.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Submit custom KPI for review (Priority: P1)

As a non-DEV user, I can submit a new custom KPI that enters a review queue
instead of becoming active immediately.

**Why this priority**: This is the entry point for the entire workflow. Without
submission and pending state handling, no review can happen.

**Independent Test**: Can be fully tested by submitting a new custom KPI and
verifying it is stored as pending review, visible in the requester's history,
and unavailable as an approved KPI.

**Acceptance Scenarios**:

1. **Given** an authenticated user with permission to create custom KPIs,
   **When** they submit a custom KPI with required fields, **Then** the KPI is
   recorded with status "Pending Review" and linked to the submitting user.
2. **Given** a submitted custom KPI in pending status, **When** the submitter
   views their KPI request list, **Then** they can see the pending request and
   submission timestamp.

---

### User Story 2 - DEV review and decision (Priority: P1)

As a DEV reviewer, I can evaluate pending custom KPI requests, decide whether an
existing KPI should replace the request, and approve or reject the request with
a reason.

**Why this priority**: Business quality control depends on DEV review to prevent
KPI duplication and ensure consistent KPI catalog governance.

**Independent Test**: Can be fully tested by opening a pending request as a DEV
user, selecting either replacement/approval/rejection, submitting the decision,
and verifying the resulting status and recorded rationale.

**Acceptance Scenarios**:

1. **Given** a pending custom KPI request, **When** a DEV reviewer identifies an
   existing KPI that covers the same intent, **Then** they can mark the request
   as replaced by that KPI, record the selected replacement KPI, and provide
   rationale for the replacement decision.
2. **Given** a pending custom KPI request, **When** a DEV reviewer determines
   the KPI is valid and unique, **Then** they can approve the request, set
   status to "Approved," and make the KPI usable only by the submitter until
   global promotion is completed.
3. **Given** a pending custom KPI request, **When** a DEV reviewer determines
   the KPI should not be accepted, **Then** they can reject the request and
   provide a rejection reason.

---

### User Story 3 - Email submitter review outcome (Priority: P2)

As a submitting user, I receive an email once review is complete so I understand
whether my custom KPI was approved, rejected, or replaced.

**Why this priority**: Review actions are not complete from a user perspective
unless the submitter is informed of the result and any follow-up action.

**Independent Test**: Can be fully tested by completing a review decision and
confirming that the submitting user receives a decision email containing the
final status and explanation.

**Acceptance Scenarios**:

1. **Given** a custom KPI request has been approved, **When** the decision is
   finalized, **Then** the submitter receives an email stating the request was
   approved.
2. **Given** a custom KPI request has been rejected or replaced, **When** the
   decision is finalized, **Then** the submitter receives an email with the
   outcome and reviewer explanation.

### Edge Cases

- A reviewer attempts to review a request that has already been decided by
  another reviewer; the system must prevent duplicate/conflicting decisions.
- A reviewer tries to mark a request as replaced without selecting an existing
  KPI; the system must block submission and require a replacement selection.
- A notification delivery attempt fails; the system must preserve the decision
  state and retry or surface an operational alert without changing the outcome.
- A submitter edits or resubmits essentially identical KPI content while an
  existing request is still pending; the system must prevent duplicate pending
  requests for the same user and KPI definition.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow eligible users to submit new custom KPI requests
  with required business metadata and store each request in a "Pending Review"
  state.
- **FR-002**: System MUST restrict review actions (approve, reject, mark as
  replaced) to users with DEV reviewer privileges.
- **FR-003**: System MUST provide DEV reviewers with the pending request details
  required to evaluate uniqueness and suitability.
- **FR-004**: System MUST allow a DEV reviewer to mark a pending request as
  "Replaced" only by manually selecting a single existing KPI and recording the
  reviewer rationale for why it replaces the requested KPI.
- **FR-005**: System MUST allow a DEV reviewer to approve or reject a pending
  request and record a decision rationale.
- **FR-006**: System MUST enforce one final decision per request and prevent
  additional decision changes unless an override is performed by a DEV reviewer
  with mandatory override rationale, reference to the prior decision ID,
  immutable override event recording, and timestamped reviewer identity.
- **FR-007**: System MUST send an email to the submitting user when review is
  completed and include final outcome (Approved, Rejected, or Replaced) plus
  reviewer explanation.
- **FR-008**: System MUST maintain an auditable history for each request,
  including submitter, reviewer, decision timestamp, final outcome, rationale,
  and override history when a decision is changed.
- **FR-009**: System MUST prevent duplicate pending submissions by the same user
  for the same KPI definition.
- **FR-010**: Users MUST be able to view the current status and final result of
  their own submitted custom KPI requests.
- **FR-011**: System MUST, on approval, make the custom KPI active for the
  submitting user only and prevent broader user access until a separate global
  promotion action is completed.
- **FR-012**: System MUST allow any DEV reviewer to execute the global promotion
  action that changes an approved custom KPI from submitter-only visibility to
  broader visibility.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Submission endpoints and screens require authenticated
  users with KPI creation permissions; review endpoints and review UI actions
  (including override and global promotion actions) require DEV reviewer
  authorization checks on every request.
- **CA-002 Data Integrity**: Persist custom KPI request lifecycle states
  (Pending Review, Approved, Rejected, Replaced), approved KPI visibility scope
  (Submitter-Only vs Globally Promoted), and replacement links in a way that
  preserves historical accuracy for downstream KPI reporting and audit
  workflows; if schema changes are required, include matching Drizzle schema and
  migration updates.
- **CA-003 Validation**: Delivery evidence MUST include successful execution of
  `npm run lint`, `npm run build`, and automated tests covering submission,
  review authorization, decision outcomes, and notification triggers.
- **CA-004 UX Accessibility**: All affected screens MUST define loading, empty,
  error, and success states; decision controls must be keyboard-operable, have
  clear focus order, and expose outcome/status updates with screen-reader
  compatible messaging.
- **CA-005 UI Standards**: New or changed interface elements must follow
  existing Tailwind CSS tokens and shadcn-compatible component primitives
  already used in the workspace.
- **CA-006 Reuse**: Shared status badges, review decision controls, and
  notification formatting logic must be reused or extracted into shared
  components/services instead of duplicating patterns across pages.

### Key Entities _(include if feature involves data)_

- **Custom KPI Request**: User-submitted request for a KPI not currently
  available; includes submitter, KPI definition fields, lifecycle status, and
  submission metadata.
- **KPI Review Decision**: Reviewer outcome record for a custom KPI request;
  includes reviewer identity, decision type (Approved/Rejected/Replaced),
  rationale, decision timestamp, and optional linked replacement KPI.
- **KPI Visibility Scope**: Access scope attached to approved custom KPIs
  indicating whether usage is restricted to submitter-only or promoted for
  broader use.
- **KPI Promotion Action**: Governance action performed by a DEV reviewer to
  promote an approved KPI from submitter-only scope to broader visibility.
- **KPI Replacement Link**: Relationship mapping a rejected/replaced custom
  request to an existing KPI that should be used instead.
- **Review Email Notification**: Outcome email sent to the submitter after final
  decision; includes request reference, final status, summary rationale, and
  delivery state.

### Assumptions

- "DEV user" refers to users assigned a reviewer role with permission to make
  final decisions on custom KPI requests.
- A custom KPI request has one final decision outcome: Approved, Rejected, or
  Replaced.
- Approved custom KPIs are initially active for submitter-only use until a
  separate global promotion process updates visibility scope.
- Any DEV reviewer may perform the global promotion process for approved
  submitter-only KPIs.
- Notification channel for this feature is email only and is expected to be near
  real-time.
- "Can be replaced by an existing KPI" means the reviewer manually chooses the
  existing KPI that should be used and provides rationale instead of creating a
  new KPI entry.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 95% of submitted custom KPI requests are visible to DEV reviewers
  in the pending queue within 1 minute of submission.
- **SC-002**: 90% of reviewed requests receive a final decision (Approved,
  Rejected, or Replaced) within 2 business days.
- **SC-003**: 99% of final review decisions trigger a submitter email within 5
  minutes of decision completion.
- **SC-004**: 100% of finalized requests include reviewer identity, decision
  timestamp, and rationale in the audit history.
- **SC-005**: Within one reporting cycle after rollout, duplicate custom KPI
  submissions decrease by at least 30% compared with the prior cycle baseline.
