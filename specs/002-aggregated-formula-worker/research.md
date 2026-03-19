# Phase 0 Research: Aggregated Formula Worker Processing

## Decision 1: Trigger processing asynchronously after data-entry commit

- Decision: Start aggregated formula processing asynchronously only after the
  triggering data-entry write is committed.
- Rationale: This directly satisfies FR-020 and FR-021, keeps save UX
  responsive, and avoids coupling processing latency to the user save path.
- Alternatives considered:
- Inline processing in save request: rejected because it blocks save response
  and conflicts with clarified behavior.
- Scheduled batch processing only: rejected because feature requires per-save
  trigger behavior.

## Decision 2: Use source-value snapshot semantics within a run

- Decision: Evaluate all formulas in a run against a consistent source snapshot
  and do not feed newly computed aggregated values into other formulas in the
  same run.
- Rationale: Matches clarified requirement (FR-017, FR-018), prevents
  order-dependent results, and simplifies deterministic testing.
- Alternatives considered:
- Topological re-evaluation with computed-value chaining: rejected because
  current clarified behavior explicitly defers computed values to next trigger.
- Arbitrary-order immediate visibility: rejected due to non-deterministic
  outcomes.

## Decision 3: Concurrency model is same-scope parallel with last-write-wins

- Decision: Permit concurrent processing runs for the same reporting scope and
  persist the last completed write for overlapping targets.
- Rationale: Directly reflects clarification and FR-013/FR-014.
- Alternatives considered:
- Single-flight per scope queue: rejected by explicit clarification.
- Global singleton worker: rejected due to unnecessary throughput bottleneck.

## Decision 4: Missing/unknown variable treatment

- Decision: Treat null/undefined values and unknown variable references as
  missing dependencies; skip that target and continue run.
- Rationale: Aligns FR-005 and FR-019 and keeps failure isolation per target.
- Alternatives considered:
- Fail run on unknown variable: rejected because skip-and-continue behavior is
  required.
- Coerce missing/unknown to zero: rejected because it risks silent data
  corruption.

## Decision 5: Runtime formula-evaluation error handling

- Decision: If formula evaluation throws or returns invalid runtime output for a
  target, mark target as skipped with evaluation-error reason and continue
  remaining targets.
- Rationale: Aligns FR-015 and FR-016 while preserving throughput.
- Alternatives considered:
- Fail whole run on evaluation error: rejected as over-disruptive.
- Retry loops before skip: rejected as unnecessary complexity not required by
  spec.

## Decision 6: Variable resolution scope

- Decision: Resolve formula variables from data-entry values constrained to the
  same reporting scope as trigger context.
- Rationale: Required by FR-003 and integrity constraints to avoid cross-scope
  contamination.
- Alternatives considered:
- Cross-scope fallback lookup: rejected because it violates reporting-scope
  integrity.

## Decision 7: Outcome recording model

- Decision: Persist or emit per-target outcomes with status (`calculated` or
  `skipped`) and a machine-readable reason for skipped targets.
- Rationale: Required by FR-009, FR-010, FR-016 and supports operations audit.
- Alternatives considered:
- Run-level summary only: rejected because target-level traceability is
  required.

## Decision 8: Validation strategy for delivery

- Decision: Validate with `npm run lint`, `npm run build`, and Vitest
  unit/integration coverage focused on eligibility, skip rules, snapshot
  semantics, async trigger behavior, and concurrent write outcomes.
- Rationale: Satisfies constitution quality gate and CA-003.
- Alternatives considered:
- Manual validation only: rejected by constitution quality gate.
