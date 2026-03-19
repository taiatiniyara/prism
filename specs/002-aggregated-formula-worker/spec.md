# Feature Specification: Aggregated Formula Worker Processing

**Feature Branch**: `002-aggregated-formula-worker`  
**Created**: 2026-03-19  
**Status**: Draft  
**Input**: User description: "I need to run a nodejs worker thread triggered by
input data entry. This worker thread should run all aggregated = true inputs
that have formulas, get the values of variables specified in the formulas from
the data entry table, and then fill in the values. If a variable value is null
or undefined, it moves on to the next input formula and calculates it."

## Clarifications

### Session 2026-03-19

- Q: How should concurrent triggers for the same reporting scope be handled? →
  A: Allow parallel runs for the same scope; last database write wins.
- Q: How should formula evaluation errors be handled? → A: Skip only the failing
  target, mark reason, continue remaining formulas.
- Q: During a run, should newly computed aggregated values be available to other
  formulas in the same run? → A: Evaluate all formulas from source snapshot
  only; do not use newly computed aggregated values until next trigger.
- Q: How should unknown variable references be handled? → A: Treat unknown
  variable as missing dependency; skip target and continue.
- Q: Should processing run inline with save or asynchronously? → A: Trigger
  processing asynchronously after save commit; user does not wait.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Auto-calculate eligible aggregated inputs (Priority: P1)

As a data-entry user, when I submit or save input data, the system automatically
calculates all formula-based aggregated inputs that have enough source values so
I do not need manual follow-up calculations.

**Why this priority**: Automatic completion of aggregated inputs is the core
business value and removes the highest-friction manual task.

**Independent Test**: Can be fully tested by saving a data-entry record that has
aggregated formula targets with all required variables present and verifying
calculated values are populated.

**Acceptance Scenarios**:

1. **Given** a data-entry update is accepted and there are aggregated inputs
   with formulas whose variables all have values, **When** post-entry processing
   runs, **Then** each eligible aggregated input is calculated and saved.
2. **Given** multiple eligible aggregated formulas exist for the same reporting
   scope, **When** processing runs, **Then** each eligible formula target is
   updated exactly once per processing run.

---

### User Story 2 - Continue processing when dependencies are missing (Priority: P2)

As a data-entry user, if one formula cannot be computed because a required
variable value is null or undefined, the system skips that formula and continues
evaluating remaining formulas so one incomplete input does not block other
calculations.

**Why this priority**: Preventing pipeline blockage ensures partial data
readiness and reduces operational delays.

**Independent Test**: Can be fully tested by saving data where one formula has a
missing variable and another formula is complete, then verifying the incomplete
one is skipped while the complete one is still calculated.

**Acceptance Scenarios**:

1. **Given** an aggregated formula references at least one missing variable
   value, **When** processing evaluates formulas, **Then** that formula is
   skipped without erroring the full run.
2. **Given** one formula is skipped for missing values and later formulas have
   complete values, **When** the same run continues, **Then** later formulas are
   still calculated and persisted.

---

### User Story 3 - Traceable processing outcome (Priority: P3)

As an operations user, I can determine which aggregated formulas were calculated
and which were skipped during each processing run so I can audit data
completeness and follow up on gaps.

**Why this priority**: Visibility into outcomes improves trust, troubleshooting
speed, and operational support.

**Independent Test**: Can be fully tested by running a mixed dataset and
verifying each formula target is classified as calculated or skipped with an
explicit reason for skipped items.

**Acceptance Scenarios**:

1. **Given** a processing run with both computable and non-computable formulas,
   **When** run results are recorded, **Then** each formula target has an
   outcome status of calculated or skipped.
2. **Given** a skipped formula due to missing variable values, **When** the run
   summary is reviewed, **Then** the summary indicates the formula was skipped
   for missing required values.

### Edge Cases

- A formula is present but resolves to no variable references.
- A formula references a variable that does not exist in the current reporting
  scope.
- A formula references the same variable more than once.
- Formula evaluation produces a non-finite value.
- All candidate formulas are skipped due to missing dependencies.
- New data arrives for previously missing variables after a prior skipped run.
- Multiple data-entry writes trigger overlapping formula runs for the same
  reporting scope.
- Background processing completes after user navigates away from data-entry
  context.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST trigger aggregated formula processing immediately
  after a successful data-entry write for the same reporting scope.
- **FR-002**: System MUST include only inputs where aggregated is true and a
  non-empty formula is defined in the processing set.
- **FR-003**: System MUST identify formula variables and fetch their
  corresponding values from data-entry records in the same reporting scope.
- **FR-004**: System MUST calculate formula results only when all referenced
  variable values required by that formula are present and valid, and MUST
  persist each calculated result to the data-entry table row for the same report
  period using the target formula input definition id (`inputDefId`).
- **FR-005**: System MUST skip a formula when any required variable value is
  null or undefined.
- **FR-006**: System MUST continue processing remaining formulas even when one
  or more formulas are skipped.
- **FR-007**: System MUST treat each formula target independently so a failure
  or skip for one target does not overwrite or block other targets.
- **FR-008**: System MUST preserve existing target values for formulas that are
  skipped in a run.
- **FR-009**: System MUST record per-target processing outcomes with at least
  calculated or skipped status and a reason for skipped outcomes.
- **FR-010**: System MUST make processing results available for operational
  review for each run.
- **FR-011**: System MUST ensure repeated processing on unchanged source values
  produces consistent target values.
- **FR-012**: Users MUST be able to re-trigger calculation for the same
  reporting scope by submitting updated input values.
- **FR-013**: System MUST allow concurrent processing runs for the same
  reporting scope when multiple triggers occur close together.
- **FR-014**: When concurrent runs write the same aggregated target, system MUST
  persist the result of the last completed write.
- **FR-015**: If evaluation of a formula target fails at runtime, system MUST
  skip only that target and continue evaluating remaining targets in the same
  run.
- **FR-016**: For runtime evaluation failures, system MUST record a skipped
  outcome reason that identifies evaluation error.
- **FR-017**: Within a single processing run, system MUST evaluate formulas
  against a consistent source-value snapshot.
- **FR-018**: Within the same run, newly computed aggregated target values MUST
  NOT be used as input dependencies for evaluating other formulas.
- **FR-019**: If a formula references a variable that cannot be resolved in the
  current reporting scope, system MUST treat it as a missing dependency, skip
  that target, and continue the run.
- **FR-020**: System MUST trigger aggregated formula processing asynchronously
  after the triggering data-entry write is committed.
- **FR-021**: System MUST NOT block save-response completion on aggregated
  formula processing completion.
- **FR-022**: For each calculated target, the write key MUST be
  (`reportPeriodId`, `inputDefId`, and existing reporting-scope dimensions) so
  outcomes are stored under the correct formula input definition for that
  period.
- **FR-023**: In the data-entry flow, system MUST provide non-blocking,
  accessible user feedback when background aggregated formula processing
  completes and when one or more targets are skipped, including a concise status
  summary and a route to detailed outcomes.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Only authorized data-entry workflows may trigger formula
  processing, and processing must operate only within the triggering user's
  permitted reporting scope.
- **CA-002 Data Integrity**: Formula calculations must only update intended
  aggregated targets and must not modify non-aggregated input records.
- **CA-003 Validation**: Delivery evidence must include successful static
  checks, a successful production build, and automated tests for calculation,
  skip, and continuation behavior.
- **CA-004 UX Accessibility**: User-facing data-entry flows must communicate
  when background formula processing has completed or produced skipped outcomes
  without blocking entry tasks.
- **CA-005 UI Standards**: Any new or changed user-facing status indicators for
  processing outcomes must align with existing application design patterns.
- **CA-006 Reuse**: Formula parsing, dependency collection, and result
  classification rules must be reused consistently across all calculation
  triggers.

### Assumptions

- Aggregated formula processing is scoped to the same contextual dimensions used
  by the triggering data-entry write.
- Null and undefined source values are both considered missing dependencies and
  are not coerced to numeric defaults.
- Skipping an ineligible formula is expected behavior and not treated as a
  processing failure.
- Formula definitions are managed elsewhere and are considered valid at the time
  processing runs.

### Key Entities _(include if feature involves data)_

- **Input Definition**: Input metadata containing aggregated flag, formula text,
  and target identity.
- **Formula Variable Reference**: Named variable token extracted from a formula
  and mapped to a source input.
- **Data Entry Value**: Recorded value for an input in a specific reporting
  scope, including possible missing state.
- **Aggregated Calculation Run**: A single triggered processing cycle that
  evaluates all eligible aggregated formulas for a scope.
- **Calculation Outcome**: Per-target result indicating calculated or skipped
  status and accompanying details.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of eligible aggregated formulas with
  complete dependencies are populated during the same processing run.
- **SC-002**: In acceptance testing, 100% of formulas with at least one missing
  dependency are skipped without blocking calculations for other formulas.
- **SC-003**: For mixed datasets, at least 95% of processing runs finish within
  30 seconds from data-entry submission.
- **SC-004**: In operational review, 100% of processed formula targets include a
  recorded outcome status and, when skipped, a reason.
- **SC-005**: Manual follow-up calculations for eligible aggregated targets are
  reduced by at least 80% compared to the baseline workflow.
