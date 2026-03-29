# Research: KPI Balanced Scorecard

## Decision 1: Reuse existing BSC and KPI entities as score inputs

- Decision: Build scorecard aggregation on existing `kpi`, `kpi_definitions`,
  and `bsc` entities, using admin-managed mappings already represented in the
  domain model.
- Rationale: The schema already contains perspective relationships
  (`bsc.perspective_level`) and KPI values; reuse avoids duplicate sources of
  truth and supports constitution data-integrity principles.
- Alternatives considered:
  - Create a separate scorecard table for precomputed values: rejected because
    it adds write-path complexity and drift risk.
  - Hardcode perspective mapping in UI config: rejected because mappings must be
    admin-managed and auditable.

## Decision 2: Use server-side read service plus API route

- Decision: Add a dedicated server-side scorecard service and expose it via an
  authenticated API route under `app/api/data-entry/balanced-scorecard`.
- Rationale: Existing data-entry flows already enforce auth and validation in
  API/service boundaries; this preserves server-first business logic and typed
  transport contracts.
- Alternatives considered:
  - Compute entirely in client component: rejected because security and
    deterministic logic must stay server-side.
  - Fetch directly from DB in route without service layer: rejected to keep
    route thin and testable domain logic in service module.

## Decision 3: Deterministic aggregation policy

- Decision: Implement weighted scoring with these fixed rules: latest-approved
  dedupe, invalid-row exclusion with reasons, and perspective + overall weighted
  averages.
- Rationale: Matches approved clarifications, enables reproducible test
  outcomes, and supports transparent review behavior.
- Alternatives considered:
  - Equal-weight averaging: rejected by clarification decision.
  - Status-point-only scoring: rejected by clarification decision.
  - Full-fail on invalid rows: rejected by clarification decision.

## Decision 4: Concurrency policy for filter updates

- Decision: Enforce last-filter-wins; stale in-flight requests are canceled or
  ignored.
- Rationale: Prevents stale score snapshots when users rapidly change filter
  context and aligns with clarified UX behavior.
- Alternatives considered:
  - Queue all filter requests: rejected due to laggy UX and stale intermediate
    renders.
  - First-filter-wins: rejected because it blocks user intent and delays
    up-to-date insights.

## Decision 5: Validation and testing strategy

- Decision: Require lint/build checks and add unit tests for aggregation logic
  plus integration tests for route auth, validation, and response semantics.
- Rationale: Constitution requires verifiable quality gates and regression
  evidence for behavior-changing features.
- Alternatives considered:
  - Manual-only verification: rejected as insufficient for regression safety.
  - Integration tests only: rejected because complex score calculations need
    deterministic unit-level coverage.
