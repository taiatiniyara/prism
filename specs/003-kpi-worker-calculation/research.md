# Phase 0 Research: KPI Background Calculation Worker

## Decision 1: Trigger worker post-commit and asynchronously

- Decision: Run KPI recalculation asynchronously after input write commit for
  create/update paths.
- Rationale: Preserves responsive data-entry UX while guaranteeing worker reads
  committed state.
- Alternatives considered:
- Inline synchronous calculation in request path: rejected because it increases
  save latency and failure coupling.
- Batch scheduler only: rejected because specification requires per-input
  trigger behavior.

## Decision 2: KPI impact resolution source

- Decision: Determine affected KPIs from `kpi_definitions.formula_inputs`
  mappings keyed by `input_def_id`.
- Rationale: This is the authoritative linkage between input definitions and KPI
  formulas in current schema.
- Alternatives considered:
- Hard-coded mapping table in service layer: rejected because it duplicates
  schema truth and drifts.
- Naming convention inference from formula text only: rejected because it is
  brittle and non-authoritative.

## Decision 3: Aggregation roll-up semantics when KPI agg level is higher

- Decision: When
  `kpi_definitions.agg_level_id > input_definitions.agg_level_id`, aggregate
  source values over the full report period for matching `input_def_id`,
  including all saved statuses.
- Rationale: Matches clarified requirement and ensures deterministic formula
  input for rolled-up KPI scope.
- Alternatives considered:
- Include approved/finalized statuses only: rejected by clarification.
- Use only latest row per source: rejected because requirement is period sum.

## Decision 4: Missing required period inputs behavior

- Decision: If any required period input is missing for roll-up evaluation, mark
  attempt failed and do not persist completed KPI value.
- Rationale: Prevents silent corruption and aligns with explicit clarification.
- Alternatives considered:
- Treat missing as zero: rejected due to hidden data-quality risk.
- Store partial result with warning: rejected because completion semantics must
  remain strict.

## Decision 5: Formula version consistency

- Decision: Snapshot formula definition/version at trigger time and evaluate
  attempt against that snapshot.
- Rationale: Guarantees auditability and deterministic outcomes even when KPI
  definitions change during queue delay.
- Alternatives considered:
- Always use latest formula at execution time: rejected because outcomes become
  timing-dependent.
- Restart attempt on version mismatch: rejected as unnecessary complexity for
  this scope.

## Decision 6: Concurrent trigger policy per KPI scope

- Decision: Suppress immediate duplicate trigger execution for the same KPI
  scope while one attempt is running, and retain one deferred follow-up
  recalculation marker to execute after completion.
- Rationale: Prevents duplicate in-flight writes while preserving newest
  authoritative outcome semantics.
- Alternatives considered:
- Ignore without follow-up recalculation: rejected because newer updates may be
  skipped.
- Cancel-and-restart active run: rejected due to wasted compute and
  partial-state risk.

## Decision 7: Transient failure strategy

- Decision: Retry transient execution failures up to 3 attempts with backoff
  before marking failed.
- Rationale: Improves resilience for temporary DB/network faults while bounding
  retry cost.
- Alternatives considered:
- No retries: rejected due to poor robustness.
- Infinite retries: rejected due to queue starvation and operational risk.

## Decision 8: Audit and observability model

- Decision: Persist calculation attempt records with status, failure reason,
  timing, formula version snapshot, and retry metadata.
- Rationale: Satisfies traceability and supports operations diagnosis for
  reporting-critical KPI outputs.
- Alternatives considered:
- Log-only (non-persistent) outcomes: rejected due to insufficient audit
  durability.
- KPI-row-only flags without attempt history: rejected because attempt-level
  traceability is required.

## Decision 9: Validation strategy

- Decision: Validate with `npm run lint`, `npm run build`, and Vitest
  unit/integration tests for triggering, roll-up computation, missing-input
  failure, formula snapshot, deferred follow-up recalculation behavior, and
  retry behavior.
- Rationale: Meets constitution quality gate and feature CA-003 obligations.
- Alternatives considered:
- Manual testing only: rejected by constitution quality requirements.
