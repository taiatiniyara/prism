# Feature Specification: Review KPI Values Workspace

**Feature Branch**: `[005-review-kpi-values]`  
**Created**: 2026-03-24  
**Status**: Draft  
**Input**: User description: "Have a look at the /data-entry/review-kpi page. In
there, I want a list of kpi values. In a row, I want on the left to display the
input values, in the middle, the KPI formula, and on the right, the kpi result.
the top screen should have cookie based filters of report type, report period,
kpi category and kpi subcategory (kpi category filters kpi subcategory through
parent_id), service area. Inputs have a comment section in which different users
can post their feedbacks on individual inputs. Inputs are editable which will
trigger recalculation of the KPI it's under."

## Clarifications

### Session 2026-03-24

- Q: When two users edit the same input concurrently, what should happen on
  save? → A: Optimistic concurrency with conflict error; second saver is
  blocked, shown latest value, and must re-apply changes.
- Q: Who should receive an input-update event in real time? → A: Authorized
  users whose current filtered result set includes the affected KPI/input.

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Review KPI Rows (Priority: P1)

As a KPI reviewer, I can see KPI rows in a consistent three-column layout where
each row shows input values on the left, the KPI formula in the middle, and the
KPI result on the right.

**Why this priority**: This is the core purpose of the page; without this view,
users cannot review KPI calculations.

**Independent Test**: Can be fully tested by opening the review page with KPI
data and verifying each row renders all three sections correctly and
consistently across multiple KPIs.

**Acceptance Scenarios**:

1. **Given** KPI data exists for the selected context, **When** the reviewer
   opens the page, **Then** each KPI appears as one row with left input values,
   middle formula, and right result.
2. **Given** one KPI has multiple input values, **When** the row is rendered,
   **Then** all associated input values are visible within the input area for
   that row.
3. **Given** no KPI data exists for the selected context, **When** the page
   loads, **Then** an empty-state message is shown explaining that no KPI values
   are available.

---

### User Story 2 - Filter KPI Context (Priority: P2)

As a KPI reviewer, I can apply cookie-persisted filters (report type, report
period, KPI category, KPI subcategory, and service area) so I can focus on the
KPI set relevant to my current review.

**Why this priority**: Reviewers need to narrow scope quickly; persistent
filters reduce repetitive setup and prevent context loss.

**Independent Test**: Can be fully tested by applying filters, refreshing or
returning to the page, and verifying filters and resulting rows are restored
from cookies.

**Acceptance Scenarios**:

1. **Given** the reviewer selects filter values, **When** the selection changes,
   **Then** the KPI list updates to match the selected filter combination.
2. **Given** a KPI category is selected, **When** subcategory options are shown,
   **Then** only subcategories with matching `parent_id` are available.
3. **Given** the reviewer revisits the page in the same browser, **When** the
   page loads, **Then** previously selected filter values are restored from
   cookies.

---

### User Story 3 - Edit Inputs With Discussion (Priority: P3)

As a KPI reviewer or contributor, I can edit input values and leave comments on
individual inputs so calculations stay current and team feedback is captured in
context.

**Why this priority**: Editing and feedback complete the review workflow by
enabling correction and collaborative validation.

**Independent Test**: Can be fully tested by editing one input, confirming the
KPI result updates, and posting comments from different users on the same input.

**Acceptance Scenarios**:

1. **Given** an editable input value, **When** a user saves a valid change,
   **Then** the KPI result for that KPI is recalculated and displayed.
2. **Given** another authorized user is currently viewing the same KPI row,
   **When** an input value is saved by a different user, **Then** any authorized
   viewer whose current filtered result set includes that KPI/input sees the
   updated input value and recalculated KPI result automatically without manual
   refresh.
3. **Given** multiple users add comments to one input, **When** comments are
   viewed, **Then** each comment is listed with author identity and timestamp in
   chronological order.
4. **Given** an invalid input edit, **When** the user attempts to save, **Then**
   the edit is rejected with a clear validation message and no KPI recalculation
   is applied.
5. **Given** two users edited the same input from different stale views,
   **When** the second user submits after the first save already committed,
   **Then** the second save is rejected with a conflict message, the latest
   committed value is shown, and the user must re-apply any intended edit.

---

### Edge Cases

- A selected KPI category has no related subcategories; the subcategory filter
  must gracefully show no options and not break filtering.
- Cookie values are missing, expired, or invalid; the page must fall back to
  default filter values and load safely.
- A user edits an input while another user has just updated the same input; the
  second save must be blocked with a conflict response and no silent overwrite.
- A KPI formula references one or more missing inputs; the row must show a clear
  unresolved-calculation state instead of a misleading result.
- Comment submission fails due to a transient error; user-entered comment text
  should not be lost and retry should be possible.
- A viewer temporarily loses connectivity during another user's update; once
  connectivity resumes, the latest saved values and KPI results should
  synchronize automatically.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST render the review KPI page as a row-based list
  where each KPI row contains three visible sections: input values (left), KPI
  formula (center), and KPI result (right).
- **FR-002**: The system MUST provide top-level filters for report type, report
  period, KPI category, KPI subcategory, and service area.
- **FR-003**: The system MUST persist selected filter values in browser cookies
  and restore them on subsequent visits in the same browser context.
- **FR-004**: The system MUST constrain KPI subcategory options to those whose
  `parent_id` matches the selected KPI category.
- **FR-005**: The system MUST update the displayed KPI row list whenever filter
  selections change.
- **FR-006**: Authorized users MUST be able to edit input values from the KPI
  row input section.
- **FR-007**: When an input value edit is successfully saved, the system MUST
  recalculate and refresh the KPI result for the KPI associated with that input.
- **FR-008**: The system MUST validate edited input values before saving and
  MUST reject invalid edits with clear, field-level feedback.
- **FR-009**: Each input MUST include a comment thread where multiple users can
  add feedback entries.
- **FR-010**: The system MUST store and display each input comment with author
  identity and submission timestamp.
- **FR-011**: The system MUST show explicit loading, empty, and error states for
  KPI list retrieval, filter application, input save, recalculation, and comment
  submission.
- **FR-012**: The system MUST prevent unauthorized users from editing inputs or
  posting comments.
- **FR-013**: When an input value is updated and saved by one authorized user,
  the system MUST propagate the updated input value and corresponding
  recalculated KPI result to other authorized users whose current filtered
  result set includes the affected KPI/input, without requiring manual page
  refresh.
- **FR-014**: If real-time propagation is temporarily unavailable, the system
  MUST automatically reconcile viewers to the latest saved KPI values once
  connectivity is restored and indicate any temporary sync issue clearly.
- **FR-015**: Input updates MUST use optimistic concurrency checks so stale
  writes are rejected when the underlying input was changed after the editor
  loaded it.
- **FR-016**: On concurrency conflict, the system MUST return a clear conflict
  response, refresh the client with the latest committed value, and require user
  confirmation through a re-submitted edit before applying further changes.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Editing input values and posting comments are protected
  actions and require authenticated users with explicit edit/comment permissions
  for the selected KPI context.
- **CA-002 Data Integrity**: Input edits mutate KPI input records and must
  trigger consistent recalculation of dependent KPI results; comment writes
  mutate input comment records without altering source values; synchronized
  viewers must converge on the same committed values.
- **CA-003 Validation**: Delivery evidence MUST include successful project
  linting, production build validation, and automated test coverage for
  filtering, edit/recalculate flow, and input comments.
- **CA-004 UX Accessibility**: Filter controls, editable inputs, and comment
  actions MUST be keyboard operable, screen-reader labeled, and expose clear
  loading/empty/error feedback, including live-update and re-sync state
  announcements.
- **CA-005 UI Standards**: New or changed UI elements MUST use existing project
  styling and component conventions so the page remains visually and
  behaviorally consistent with the app.
- **CA-006 Reuse**: Shared filter logic, KPI row rendering patterns, and
  comment-thread behavior MUST be reusable across related KPI review contexts
  where applicable.

### Key Entities _(include if feature involves data)_

- **KPI Row**: A review unit that combines selected-context metadata with
  display sections for inputs, formula, and calculated result.
- **KPI Input Value**: A single editable value used in a KPI calculation,
  including input identifier, current value, validation constraints, and
  last-updated metadata.
- **KPI Formula**: A human-readable expression for how a KPI result is derived
  from one or more inputs.
- **KPI Result**: The calculated KPI output for a row, including value, status,
  and recalculation timestamp.
- **KPI Category**: A grouping dimension for KPIs that controls available
  subcategory options.
- **KPI Subcategory**: A child grouping under KPI category, linked through
  `parent_id`.
- **Review Filter Set**: User-selected filter combination (report type, report
  period, category, subcategory, service area) persisted via cookies.
- **Input Comment**: A feedback entry tied to a specific input value, including
  author, timestamp, and comment body.

### Assumptions

- The page operates within an authenticated area where user identity is already
  established.
- Existing authorization rules can distinguish users who can edit/comment from
  read-only users.
- Recalculation is scoped to the KPI affected by the edited input unless
  existing business rules explicitly require broader recalculation.
- Comment history is retained as an auditable thread rather than replacing prior
  comments.
- Default filter behavior on first visit uses the application's current
  reporting defaults when no cookies are present.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 95% of reviewers can locate and interpret a KPI row's inputs,
  formula, and result in under 15 seconds during usability testing.
- **SC-002**: 95% of filter changes update the KPI row list within 2 seconds
  under normal operating load.
- **SC-003**: 98% of valid input edits result in visible KPI recalculation
  completion without manual page refresh.
- **SC-006**: 95% of committed input value changes become visible to other
  authorized users viewing the same KPI context within 2 seconds.
- **SC-004**: 95% of comment submissions are persisted and visible to other
  authorized users within 3 seconds.
- **SC-005**: At least 90% of pilot users report that the new review flow
  improves their ability to validate KPI values compared with the prior page
  behavior.
