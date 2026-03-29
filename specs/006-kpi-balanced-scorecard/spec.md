# Feature Specification: KPI Balanced Scorecard

**Feature Branch**: `006-kpi-balanced-scorecard`  
**Created**: 2026-03-26  
**Status**: Draft  
**Input**: User description: "Help me build a balanace score card for the KPI
tables."

## Clarifications

### Session 2026-03-26

- Q: Which scoring model should be used for perspective and overall score
  calculation? → A: Configured weight model: each KPI has a weight; perspective
  score is weighted average, and overall score is weighted by perspective
  totals.
- Q: How should duplicate KPI entries in the same context and period be
  resolved? → A: Use the latest approved row only; ignore non-approved
  duplicates.
- Q: How should perspective and KPI-to-perspective mappings be managed? → A:
  Mappings are configurable in existing admin settings, and scorecard uses
  current approved mapping.
- Q: How should invalid KPI rows affect score calculations? → A: Exclude invalid
  KPI rows from scoring and show excluded count and reasons in the UI.
- Q: How should scorecard loading behave when filters change rapidly? → A:
  Last-filter-wins; stale in-flight responses are ignored or canceled.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View scorecard performance summary (Priority: P1)

As a KPI reviewer, I can open a balanced scorecard view that summarizes KPI
performance across key perspectives so I can quickly understand current health
without manually reading each KPI row.

**Why this priority**: This delivers the core value of the feature by turning
raw KPI table data into an actionable at-a-glance summary.

**Independent Test**: Can be fully tested by loading a known KPI dataset and
confirming that the scorecard displays perspective-level totals, status
breakdowns, and overall score consistently.

**Acceptance Scenarios**:

1. **Given** KPI records exist for the selected report period, **When** the user
   opens the balanced scorecard, **Then** the system shows an overall score and
   per-perspective score summaries derived from those records.
2. **Given** KPI records include mixed statuses (on track, at risk, off track),
   **When** the scorecard loads, **Then** each perspective shows the correct
   status distribution and weighted score.

---

### User Story 2 - Filter scorecard context (Priority: P2)

As a KPI reviewer, I can apply the same context filters used in KPI tables (for
example period, service area, and organization scope) so the scorecard reflects
the exact subset of KPI data I need to review.

**Why this priority**: Users must trust that scorecard outcomes match their
current KPI table context; otherwise the scorecard is not usable for decision
making.

**Independent Test**: Can be fully tested by applying each filter independently
and in combination, then confirming scorecard values update and match KPI table
totals for the same filter set.

**Acceptance Scenarios**:

1. **Given** the user changes one or more table filters, **When** they refresh
   or open the scorecard view, **Then** the scorecard recalculates using only
   KPI records in the selected filter context.
2. **Given** a filter combination returns no KPI rows, **When** the scorecard is
   displayed, **Then** the system shows an explicit empty state instead of
   zero-like misleading scores.

---

### User Story 3 - Investigate score drivers (Priority: P3)

As a KPI reviewer, I can inspect the KPIs contributing to each perspective score
so I can identify which indicators are lowering or improving the overall result.

**Why this priority**: Drilldown supports action planning after users see
summary performance.

**Independent Test**: Can be tested by selecting a perspective and verifying the
contributing KPI list, contribution values, and KPI status details match source
table data.

**Acceptance Scenarios**:

1. **Given** a perspective summary is shown, **When** the user opens its detail
   view, **Then** the system lists contributing KPIs with their individual score
   contributions and statuses.
2. **Given** a KPI has missing or invalid scoring inputs, **When** perspective
   details are viewed, **Then** that KPI is clearly marked and excluded from
   numeric aggregation rules defined for invalid data handling.

### Edge Cases

- Scorecard load when no KPI data exists for the selected report period.
- KPI rows missing target, actual, or status values required for scoring are
  excluded from numeric aggregation and shown with exclusion reasons.
- Duplicate KPI entries in the same context and period must resolve to the
  latest approved row for scoring, with non-approved rows ignored.
- KPI records with values outside allowed ranges (for example negative
  percentages where not valid).
- User changes filters while scorecard data is loading; only the latest filter
  request may update the UI, and stale in-flight responses are ignored or
  canceled.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a balanced scorecard view for KPI data that
  includes an overall score and perspective-level scores.
- **FR-002**: System MUST calculate scorecard values from KPI table records in
  the user-selected context (including report period and organizational/service
  filters).
- **FR-003**: System MUST read perspective definitions and KPI-to-perspective
  mappings from existing admin-managed settings and use the current approved
  mapping so each KPI is assigned to exactly one scorecard perspective for
  aggregation.
- **FR-004**: System MUST define and apply a deterministic configured weighting
  model where each KPI has a configured weight within its perspective,
  perspective scores are weighted averages of included KPI scores, and the
  overall score is a weighted average of perspective scores using configured
  perspective weights.
- **FR-005**: System MUST present status distribution (for example on track, at
  risk, off track) for each perspective and overall scorecard.
- **FR-006**: Users MUST be able to open a perspective detail view listing
  contributing KPIs and their individual contribution values.
- **FR-007**: System MUST clearly handle incomplete or invalid KPI scoring
  inputs by excluding invalid KPI rows from numeric aggregation, marking
  excluded records, and preventing silent calculation corruption.
- **FR-008**: System MUST provide explicit loading, empty, and error states for
  scorecard and score-detail views.
- **FR-009**: System MUST ensure scorecard totals are traceable to source KPI
  records so users can verify calculated outcomes.
- **FR-010**: System MUST resolve duplicate KPI entries for the same KPI, filter
  context, and reporting period by selecting only the latest approved row;
  non-approved rows MUST be excluded from score aggregation.
- **FR-011**: System MUST display excluded-record counts and exclusion reasons
  in scorecard detail views so users can audit why some KPI rows were not
  scored.
- **FR-012**: System MUST enforce last-filter-wins behavior during scorecard
  loading so only the most recent filter request can render results, and stale
  in-flight responses are canceled or ignored.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Access to scorecard data MUST require authenticated users
  with existing KPI review permissions; unauthorized users MUST be blocked from
  viewing scorecard summaries and drilldown details.
- **CA-002 Data Integrity**: Scorecard calculations MUST use the canonical KPI
  entities and preserve one-way traceability from every displayed score to
  contributing KPI records; any data model changes MUST include corresponding
  Drizzle schema updates and migration notes.
- **CA-003 Validation**: Delivery MUST include evidence of successful
  `npm run lint`, `npm run build`, and automated tests covering score
  calculations, filter behavior, empty/error states, and drilldown consistency
  when behavior changes.
- **CA-004 UX Accessibility**: Scorecard interactions MUST support keyboard
  navigation and screen-reader-readable labels for perspectives, scores,
  statuses, and detail toggles, with accessible messaging for loading, empty,
  and error states.
- **CA-005 UI Standards**: UI updates MUST use existing Tailwind CSS conventions
  and shadcn-compatible primitives used by current KPI table experiences.
- **CA-006 Reuse**: Shared score formatting, status badges, and KPI
  filter-context logic MUST be reused from existing components/services where
  available; repeated scorecard patterns MUST be extracted into reusable units.

### Authorization Matrix

- View scorecard summary/details:
  - DEV: Allowed
  - BMO: Allowed
  - Other authenticated roles: Denied (403)
  - Unauthenticated users: Denied (401)

### Key Entities _(include if feature involves data)_

- **KPI Record**: A measurable indicator entry for a reporting period and
  context, including KPI identifier, perspective assignment, target value,
  actual value, status, and any contribution weight.
- **Scorecard Perspective**: A category grouping KPIs for balanced scorecard
  analysis (for example financial, customer, process, learning/growth), with
  aggregated score and status distribution.
- **Score Snapshot**: Computed outcome object for the selected filter context
  containing overall score, per-perspective scores, calculation metadata, and
  excluded-record counts.
- **Filter Context**: User-selected reporting scope dimensions (period,
  organization, service area, and related dimensions) used to constrain KPI
  records included in score calculation.

### Assumptions

- Existing KPI tables already store or can derive status and values needed for
  score calculation.
- Balanced scorecard perspectives are maintained by business rules and available
  to map against KPIs.
- The scorecard is read-focused in this feature (view and analyze), with no new
  KPI editing workflow introduced.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 95% of scorecard views load and present complete summary values
  within 3 seconds for a representative monthly review dataset profile of 2,000
  KPI candidate rows across 4 perspectives, including approximately 20% excluded
  rows.
- **SC-002**: For a validated test dataset, 100% of perspective and overall
  score outputs match expected business-approved calculation results.
- **SC-003**: At least 90% of pilot users can identify the lowest-performing
  perspective and its top contributing KPIs in under 2 minutes.
- **SC-004**: Manual KPI summary reconciliation effort during review meetings is
  reduced by at least 50% compared with table-only review.
