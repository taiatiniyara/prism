# Phase 0 Research: Data Entry Filters and Context

## Decision 1: Persist filter context in HTTP cookies keyed by filter dimension

- Decision: Store `reportTypeId`, `reportPeriodId`, `inputCategoryId`,
  `inputSubcategoryId`, and `serviceAreaId` in HTTP cookies and treat cookie
  values as candidate defaults only.
- Rationale: The feature explicitly requires cookie persistence, and
  cookie-based context works for server-rendered page loads where filters must
  be applied before rendering.
- Alternatives considered:
- Browser local storage: rejected because server-rendered filtering cannot
  directly rely on client-only state.
- URL-only query params: rejected because the requirement calls for cookie
  persistence and cross-visit recovery.
- Database-stored user preferences: rejected for this phase to avoid introducing
  write mutations and schema changes.

## Decision 2: Validate cookie selections against authorized option sets on each page load

- Decision: Every cookie value is validated against options scoped to the
  current user and current upstream filters; invalid values are cleared and
  replaced with deterministic defaults.
- Rationale: Prevents stale cookies from causing authorization leaks, empty
  invalid states, or broken cascades.
- Alternatives considered:
- Blind trust in stored cookies: rejected due to security and integrity risk.
- Hard failure when cookie is invalid: rejected because it blocks user
  workflows.
- Silent ignore without reset: rejected because it leaves context ambiguous.

## Decision 3: Implement cascading filters with deterministic reset rules

- Decision: Apply upstream-to-downstream resets in this order: report type ->
  report period -> category -> subcategory -> service area, with downstream
  values recalculated whenever upstream context changes.
- Rationale: This order matches user intent and avoids stale combinations.
- Alternatives considered:
- Independent filters without cascade: rejected because invalid combinations
  would persist.
- Full reset of all filters on any change: rejected because it causes excessive
  user friction.

## Decision 4: Operational and Generation behavior handled by server-composed view model

- Decision: Build a server-side view model that includes visibility flags
  (`showServiceAreaSelector`) and grouped generator sections when subcategory is
  Generation.
- Rationale: Keeps business rules in server-first architecture and makes client
  rendering simple and predictable.
- Alternatives considered:
- Compute all conditions in client components: rejected by constitution
  architecture principle.
- Separate pages for Generation vs non-Generation: rejected as unnecessary
  complexity.

## Decision 5: Generator list source and filtering rules

- Decision: Use `energy_resources` rows with `is_virtual = false` filtered by
  selected service area (and report period where applicable) as the generation
  grouping source.
- Rationale: Existing schema already models generator-like resources and virtual
  flag directly.
- Alternatives considered:
- Use `power_stations` table only: rejected because virtual/non-virtual
  semantics are on `energy_resources`.
- Display all generators regardless of service area: rejected by feature rules.

## Decision 6: Input control rendering driven by data type metadata

- Decision: Map `input_definitions.data_type_id` to an input-control type
  contract (numeric, text, boolean, select, date, fallback) in a centralized
  renderer map.
- Rationale: Meets feature requirement while keeping rendering consistent and
  extensible.
- Alternatives considered:
- Hardcode per-input components manually: rejected due to duplication and
  maintenance cost.
- Infer control types from value format only: rejected as unreliable.

## Decision 7: Validation strategy for behavior-changing work in this repository

- Decision: Enforce `npm run lint` and `npm run build`, and add targeted
  automated checks for filter-cascade and conditional rendering behavior using
  the project's chosen test tooling introduced with implementation.
- Rationale: Constitution requires lint/build and automated tests when behavior
  changes; repository currently has no established test suite, so tests must be
  introduced with this feature work.
- Alternatives considered:
- Manual verification only: rejected by quality gate.
- End-to-end only tests: rejected as too slow for cascade-rule regression
  coverage alone.

## Decision 8: Standardize automated checks on Vitest for this feature

- Decision: Use Vitest as the baseline automated test runner for unit and
  integration checks in this feature.
- Rationale: A single deterministic test runner reduces setup overhead while
  satisfying constitution quality gates for behavior-changing work.
- Alternatives considered:
- Multiple mixed test frameworks: rejected due to higher maintenance and
  onboarding cost.
- Deferring framework choice until implementation: rejected because it creates
  planning ambiguity and weakens delivery readiness.
