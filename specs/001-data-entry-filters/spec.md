# Feature Specification: Data Entry Filters and Context

**Feature Branch**: `001-data-entry-filters`  
**Created**: 2026-03-19  
**Status**: Draft  
**Input**: User description: "I want to build data entry with filter cookies for
report type, report period, category, subcategory, and service area, plus
conditional behavior for Operational and Generation contexts."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Persist and Reuse Entry Context (Priority: P1)

As a data-entry user, I can choose report type, report period, category,
subcategory, and service area filters, and the system remembers those selections
between page visits so I can continue work without resetting filters.

**Why this priority**: Persistent context is foundational for all data-entry
workflows and avoids repeated setup before users can enter or review data.

**Independent Test**: Can be fully tested by selecting each filter, refreshing
or re-entering the page, and confirming all valid selections are restored and
actively applied.

**Acceptance Scenarios**:

1. **Given** a user selects a report type and report period, **When** they
   return to data entry, **Then** the same selections are preloaded and records
   are filtered accordingly.
2. **Given** a user changes category, subcategory, and service area, **When**
   they refresh the page, **Then** the latest valid values are retained and
   applied.
3. **Given** a previously stored selection is no longer valid, **When** data
   entry loads, **Then** the invalid selection is cleared and replaced with a
   safe default.

---

### User Story 2 - Cascading Filter Selection (Priority: P2)

As a data-entry user, when I choose category and subcategory, I only see
relevant downstream filter options and input rows so I can quickly focus on the
correct data scope.

**Why this priority**: Cascading behavior prevents invalid combinations and
reduces user errors during entry.

**Independent Test**: Can be fully tested by changing category and subcategory
values and verifying that available options and displayed inputs update
immediately and correctly.

**Acceptance Scenarios**:

1. **Given** a user selects an input category, **When** available subcategories
   are refreshed, **Then** only subcategories associated with that category are
   shown.
2. **Given** a user selects an input subcategory, **When** inputs are refreshed,
   **Then** only inputs in that subcategory are shown.
3. **Given** a user changes to a category that does not support the currently
   selected subcategory, **When** filters update, **Then** the subcategory
   selection resets to a valid state.

---

### User Story 3 - Operational and Generation-Specific Views (Priority: P3)

As a data-entry user, I see additional context controls only when relevant,
including service area filtering for Operational category and generator-grouped
inputs for Generation subcategory.

**Why this priority**: Conditional UI keeps the form focused while still
supporting complex scenarios where location and generator context are required.

**Independent Test**: Can be fully tested by switching between categories and
subcategories and validating selector visibility plus grouped input presentation
behavior.

**Acceptance Scenarios**:

1. **Given** the selected category is Operational, **When** data entry renders,
   **Then** the service area selector is visible and affects input filtering.
2. **Given** the selected category is not Operational, **When** data entry
   renders, **Then** the service area selector is hidden and service area
   filtering is not applied.
3. **Given** the selected subcategory is Generation and a service area is
   selected, **When** the input list is built, **Then** only non-virtual
   generators in that service area are shown, with inputs grouped under each
   generator.

### Edge Cases

- A cookie value exists but references a report type, report period, category,
  subcategory, or service area that the user can no longer access.
- A category change invalidates subcategory and service area selections.
- No generators match the Generation + service area combination.
- A filter combination returns no input records.
- Input metadata indicates an unsupported or missing data type for rendering.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST persist the selected report type identifier in a
  cookie.
- **FR-002**: System MUST allow users to select a report type and use the stored
  report type to constrain available report periods.
- **FR-003**: System MUST persist the selected report period identifier in a
  cookie.
- **FR-004**: System MUST allow users to change the report period from the
  data-entry UI and immediately filter visible data-entry records by the
  selected report period.
- **FR-005**: System MUST persist the selected input category identifier in a
  cookie.
- **FR-006**: System MUST allow users to select an input category and update
  available subcategories and inputs to match the selection.
- **FR-007**: System MUST persist the selected input subcategory identifier in a
  cookie.
- **FR-008**: System MUST allow users to select an input subcategory and filter
  visible inputs to that subcategory.
- **FR-009**: System MUST persist the selected service area identifier in a
  cookie.
- **FR-010**: System MUST allow users to select service area and filter visible
  inputs according to the selected area whenever service area filtering is
  active.
- **FR-011**: System MUST show the service area selector only when the selected
  category is Operational.
- **FR-012**: System MUST hide the service area selector when the selected
  category is not Operational.
- **FR-013**: When selected subcategory is Generation, system MUST display
  non-virtual generators filtered by selected service area and list relevant
  inputs under each generator.
- **FR-014**: System MUST determine input field presentation behavior from each
  input's data type metadata.
- **FR-015**: If stored cookie values are missing, invalid, or no longer
  authorized, system MUST clear them and apply valid defaults without blocking
  data entry.
- **FR-016**: System MUST recalculate dependent filters when upstream filters
  change and prevent stale invalid combinations from being applied.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Only authenticated and authorized users with data-entry
  access can read filter options and data-entry records, and stored filter
  context must never expand access beyond user permissions.
- **CA-002 Data Integrity**: This feature changes user filter context and
  filtered retrieval behavior only; it does not introduce direct data mutations
  to data-entry values. Filter combinations must produce consistent,
  deterministic record sets for reporting.
- **CA-003 Validation**: Delivery evidence must include successful
  `npm run lint`, successful `npm run build`, and automated behavior checks
  covering cookie persistence, cascade filtering, conditional selector
  visibility, and Generation grouping rules.
- **CA-004 UX Accessibility**: All selectors and dynamic sections must provide
  loading, empty, and error states, plus keyboard navigation and screen-reader
  labels for changed controls.
- **CA-005 UI Standards**: New or updated interaction controls must align with
  existing Tailwind and shadcn-style component patterns used by the current
  application UI.
- **CA-006 Reuse**: Repeated filter synchronization logic and option-loading
  behavior must be centralized into reusable UI/service patterns to avoid
  duplicated logic across data-entry screens.

### Assumptions

- Users land on data entry with at least one available report type and report
  period.
- Cookie-scoped filter state is user-specific and should prefer the most recent
  valid selection.
- When no service area is selected in an Operational flow, the system applies a
  default valid service area before loading inputs.
- Input presentation can always be inferred from available data type metadata;
  if unknown, the input is shown in a safe fallback state and flagged to the
  user.

### Key Entities _(include if feature involves data)_

- **Report Type Context**: Selected reporting scope that determines which report
  periods are available for data entry.
- **Report Period Context**: Selected reporting period that filters data-entry
  records.
- **Input Category Context**: Top-level input grouping that controls available
  subcategories and visibility rules (including Operational behavior).
- **Input Subcategory Context**: Secondary grouping used to filter inputs and
  trigger Generation-specific layout.
- **Service Area Context**: Geographic or operational scope used when
  service-area filtering is active.
- **Generator**: Physical generation entity with a virtual/non-virtual status
  and service area association, used for grouping Generation subcategory inputs.
- **Input Definition**: Data-entry field metadata including category,
  subcategory, and data type used to determine display behavior.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In at least 95% of revisits to data entry, users see their last
  valid filter context restored without manual re-selection.
- **SC-002**: Users can change any filter and see updated data-entry results in
  under 2 seconds for 95% of filter changes under normal operating load.
- **SC-003**: At least 90% of test users complete a full filter setup (report
  type, report period, category, subcategory, and where applicable service area)
  on the first attempt without guidance.
- **SC-004**: Invalid filter combinations caused by stale state are
  auto-corrected with zero blocking errors in acceptance testing.
- **SC-005**: For Generation subcategory scenarios, 100% of shown generators in
  acceptance tests meet both conditions: non-virtual and matching the selected
  service area.
