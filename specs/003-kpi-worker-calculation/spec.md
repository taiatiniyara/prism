# Feature Specification: Background KPI Calculation Workers

**Feature Branch**: `003-kpi-worker-calculation`  
**Created**: 2026-03-23  
**Status**: Draft  
**Input**: User description: "I want to build background worker threads for
calculating KPIs. This workers will be triggered when a user enters an input. It
will collect all inputs mapped to a KPI from the KPI definition and use the KPI
formula to calculate the result and put it into the KPI result store."

## Clarifications

### Session 2026-03-23

- Q: For the rule where KPI agg_level_id is greater than input agg_level_id,
  what should happen if one or more required inputs for that input_def_id are
  missing in the report period? -> A: Mark calculation as failed when any
  required period input is missing.
- Q: If multiple input updates trigger recalculation for the same KPI scope
  while a job is already running, what conflict-resolution behavior should the
  worker use? -> A: Ignore immediate duplicate trigger execution while one
  calculation is in progress and run one deferred follow-up recalculation after
  completion.
- Q: Which formula version should be used if a KPI definition changes after the
  job is triggered but before calculation executes? -> A: Snapshot formula
  version at trigger time and use it for that attempt.
- Q: For report-period summation (when KPI agg level is higher), which input
  status should be included in the sum? -> A: Include all saved inputs in the
  period, regardless of status.
- Q: For transient worker failures (for example temporary DB/network issues),
  what retry policy should the system apply? -> A: Retry failed calculations up
  to 3 times with backoff.
- Q: How should the system preserve newest-authoritative results when updates
  arrive during an in-flight calculation for the same scope? -> A: Ignore
  immediate duplicate trigger execution but record one deferred follow-up
  recalculation marker and run it immediately after the in-flight attempt
  completes.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Auto-calculate KPI after data entry (Priority: P1)

As a data entry user, I want KPI values to be recalculated automatically after I
submit an input so that KPI outcomes stay current without manual recalculation.

**Why this priority**: This is the core value of the feature. Without automatic
recalculation, KPI data becomes stale and downstream reporting is unreliable.

**Independent Test**: Can be fully tested by submitting a valid input that
affects one KPI and verifying a new KPI result is produced automatically for the
relevant reporting period.

**Acceptance Scenarios**:

1. **Given** a submitted input mapped to at least one KPI, **When** submission
   is accepted, **Then** the system schedules KPI calculation work for each
   affected KPI.
2. **Given** all mapped source inputs are available and valid, **When** KPI
   calculation runs, **Then** the KPI result is stored with the computed value
   and timestamp.
3. **Given** one input affects multiple KPIs, **When** calculation work is
   processed, **Then** each affected KPI is recalculated independently.
4. **Given** a KPI aggregation level is higher than a mapped input aggregation
   level, **When** calculation runs, **Then** the worker uses the sum of all
   values in the reporting period for that input definition as the formula input
   value.

---

### User Story 2 - Provide trustworthy calculation status (Priority: P2)

As a reviewer or analyst, I want visibility into whether KPI calculations
succeeded, failed, or are pending so that I can trust KPI values and take action
when updates fail.

**Why this priority**: Users need confidence that values are up to date. Status
visibility reduces ambiguity and supports operational follow-up.

**Independent Test**: Can be tested by forcing one successful and one failed
calculation and verifying each KPI result reflects an accurate processing status
and reason where applicable.

**Acceptance Scenarios**:

1. **Given** a calculation is in progress, **When** status is checked, **Then**
   it is shown as pending or processing.
2. **Given** a calculation completes successfully, **When** status is checked,
   **Then** it is shown as completed with an updated KPI result.
3. **Given** a calculation fails, **When** status is checked, **Then** it is
   shown as failed with a user-readable failure reason.

---

### User Story 3 - Safe recalculation on corrected input (Priority: P3)

As a data steward, I want KPI values to be recalculated after corrected or
updated inputs so that previously incorrect KPI values are replaced by the
latest valid results.

**Why this priority**: Input correction is a normal workflow; KPI outputs must
stay consistent with the most recent valid data.

**Independent Test**: Can be tested by submitting an input, observing KPI result
creation, updating that input, and verifying KPI result is recalculated and
supersedes the prior value.

**Acceptance Scenarios**:

1. **Given** a previously processed input is updated, **When** the update is
   accepted, **Then** the affected KPI calculations are triggered again.
2. **Given** recalculation completes, **When** KPI data is retrieved, **Then**
   the latest result is returned as authoritative.

### Edge Cases

- An input is submitted for a KPI mapping that no longer exists.
- Required source inputs for a KPI formula are partially missing, so the
  calculation fails with a clear reason.
- A KPI formula is invalid or references a non-existent input.
- The same input is submitted repeatedly in a short period.
- A large batch of input submissions arrives at once and creates a backlog.
- A recalculation request arrives while a previous calculation for the same KPI
  is still pending; immediate duplicate trigger execution is ignored, but one
  deferred follow-up recalculation must run after the current attempt completes.
- KPI and input aggregation levels differ and require roll-up to
  reporting-period totals.
- KPI definition or formula changes while a previously triggered calculation is
  still waiting to execute.
- Report-period aggregation includes mixed input statuses (draft, submitted,
  approved) in the same period.
- Temporary infrastructure issues cause intermittent calculation execution
  failures.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST trigger KPI calculation processing whenever an
  input submission is accepted or updated.
- **FR-002**: The system MUST determine all KPIs affected by the submitted input
  using the authoritative KPI-to-input mapping definitions.
- **FR-003**: For each affected KPI, the system MUST collect all mapped source
  inputs required by the KPI formula for the relevant scope (for example:
  reporting period, organization, and service area).
- **FR-004**: The system MUST evaluate the KPI formula using the collected
  source inputs and produce one computed KPI result per affected KPI and scope.
- **FR-004A**: If a KPI aggregation level identifier is greater than a mapped
  input aggregation level identifier, the system MUST aggregate source input
  values across the full reporting period for each matching input definition
  using all saved inputs in that period regardless of status, restricted to
  records where `is_deleted = false` and `is_relevant = true`, and use that
  summed value as the formula input value.
- **FR-004B**: If any required source input for the reporting-period aggregation
  is missing, the system MUST mark the KPI calculation as failed and MUST NOT
  persist a completed KPI value for that attempt.
- **FR-004C**: Each calculation attempt MUST use a snapshot of the KPI formula
  definition captured at trigger time, even if the KPI definition changes before
  execution begins.
- **FR-005**: The system MUST persist computed KPI results so they are available
  to KPI views and downstream reporting workflows.
- **FR-006**: The system MUST record processing status for each triggered
  calculation as pending, completed, or failed.
- **FR-007**: The system MUST provide a failure reason when KPI calculation
  cannot be completed.
- **FR-008**: The system MUST support reprocessing for updated inputs and ensure
  the newest successful calculation becomes the active KPI result.
- **FR-009**: The system MUST prevent duplicate active results for the same KPI
  and scope when repeated triggers are received while a calculation is already
  running.
- **FR-009A**: If a trigger arrives for a KPI scope that is currently
  processing, the system MUST ignore immediate duplicate trigger execution,
  record a deferred recalculation marker, and execute one follow-up
  recalculation after the in-flight attempt completes.
- **FR-010**: The system MUST retain an auditable history of calculation
  attempts, including trigger time, completion time, and outcome.
- **FR-011**: The calculation attempt history MUST include the formula
  definition version used for each attempt.
- **FR-012**: For transient execution failures, the system MUST retry
  calculation attempts up to 3 times using backoff before marking the attempt as
  failed.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Only authenticated and authorized input submission flows
  may trigger KPI recalculation; unauthorized actors must not be able to enqueue
  or mutate KPI calculation outcomes.
- **CA-002 Data Integrity**: The feature updates KPI result and
  calculation-attempt records; stored results must be traceable to source input
  versions and formula versions used at calculation time.
- **CA-003 Validation**: Delivery must include evidence that linting, build, and
  automated behavior tests pass for calculation trigger, success path, and
  failure handling scenarios.
- **CA-004 UX Accessibility**: Any user-facing status displays for KPI
  processing must define clear loading, empty, success, and failure states with
  readable status text.
- **CA-005 UI Standards**: Any UI updates for KPI status or result freshness
  indicators must conform to existing project UI patterns.
- **CA-006 Reuse**: Shared logic for resolving KPI mappings, formula evaluation
  context, and status formatting must be reused across data-entry and KPI
  presentation surfaces.

### Key Entities _(include if feature involves data)_

- **Input Submission**: A user-provided value with scope context (for example
  period, organization, and service area) that can affect one or more KPIs.
- **KPI Definition**: A definition of how a KPI is calculated, including the
  formula and the list of mapped source inputs required.
- **KPI Result**: The computed outcome for a KPI in a specific scope and time
  window, including value, status, and freshness metadata.
- **Calculation Attempt**: A record of one triggered processing run for a KPI
  result, including trigger source, timestamps, and outcome details.

## Assumptions

- Input submission and update events already exist and can act as the trigger
  source for KPI processing.
- KPI formulas and input mappings are maintained as the source of truth before
  this feature executes calculations.
- KPI result consumers expect eventual consistency rather than immediate
  synchronous recalculation.
- Existing authorization rules for data entry and KPI access continue to apply.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: At least 99% of accepted input submissions trigger KPI calculation
  processing within 30 seconds.
- **SC-002**: At least 95% of successful KPI recalculations complete within 2
  minutes of trigger time under normal daily load.
- **SC-003**: 100% of failed calculations expose a human-readable failure reason
  that operations users can act on.
- **SC-004**: For corrected inputs, 100% of affected KPI views show the latest
  successful recalculated result within 5 minutes.
