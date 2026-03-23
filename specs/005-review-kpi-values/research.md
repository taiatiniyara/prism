# Phase 0 Research - Review KPI Values Workspace

## Decision 1: Real-time synchronization transport

- Decision: Use scoped near-real-time updates via a dedicated review-kpi event
  feed API contract that publishes only authorized, filter-matching KPI/input
  updates to active viewers.
- Rationale: The feature requires automatic cross-user visibility within 2
  seconds and scoped delivery (not global broadcast). A dedicated event contract
  keeps synchronization explicit, testable, and constrained to authorized result
  sets.
- Alternatives considered:
  - Global page-wide broadcast: rejected because it sends irrelevant updates and
    increases noisy UI churn.
  - Manual refresh only: rejected because it violates FR-013 and SC-006.

## Decision 2: Concurrent edit conflict policy

- Decision: Implement optimistic concurrency on input updates using the latest
  persisted row timestamp/version token and reject stale writes with a conflict
  response.
- Rationale: This was explicitly clarified by the stakeholder and prevents
  silent overwrites while preserving multi-user throughput.
- Alternatives considered:
  - Last-write-wins: rejected because it can lose user edits silently.
  - Record locking: rejected because it can block collaboration and creates
    lock-expiry complexity.

## Decision 3: Filter and cascade behavior reuse

- Decision: Reuse existing data-entry cookie context and cascade rules for
  report type, report period, category/subcategory parent relationship, and
  service area filtering.
- Rationale: Existing implementation already handles cookie persistence and
  parent-child filter sanitation; reuse aligns with constitution reuse
  principles and reduces regression risk.
- Alternatives considered:
  - Implement review-kpi-specific filter state from scratch: rejected due to
    duplication and divergence risk.

## Decision 4: Input comment storage model

- Decision: Reuse `data_entries.comments` JSON thread payload for per-input
  comments and enrich response mapping for author/time rendering.
- Rationale: The schema already supports threaded comments
  (`DataEntryComment[]`) and avoids immediate schema expansion for first
  delivery.
- Alternatives considered:
  - New normalized comments table: rejected for initial scope because it adds
    migration overhead and can be deferred if query/performance needs emerge.

## Decision 5: Recalculation trigger placement

- Decision: Keep recalculation server-side in the update mutation path by
  invoking existing KPI worker trigger flow after successful saves.
- Rationale: Existing `updateDataEntryValueAction` already triggers KPI worker
  orchestration and revalidation; extending this pattern preserves deterministic
  behavior and authorization boundaries.
- Alternatives considered:
  - Client-triggered recalculation calls: rejected because business-critical
    calculations must stay server-side.

## Decision 6: External interface style

- Decision: Define explicit internal HTTP contracts for list/read, update,
  comment, and event synchronization endpoints under
  `/api/data-entry/review-kpi/*`.
- Rationale: A contract artifact supports frontend/backend parallelization,
  testing, and traceability for this feature.
- Alternatives considered:
  - Server actions only with no contract artifact: rejected because realtime and
    conflict handling flows benefit from explicit request/response definitions.
