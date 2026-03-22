# Contract: KPI Background Calculation Worker

## Scope

Defines server-side contract for triggering, computing, and persisting KPI
results after data-entry input save/update events.

## Trigger Contract

### Input Event

- Event source: successful data-entry create/update commit
- Trigger timing: post-commit only
- Trigger mode: asynchronous

### Trigger Guarantees

- Save response must not wait for KPI worker completion.
- Trigger payload must include report period and scope dimensions required for
  KPI/input resolution.

## KPI Selection Contract

- Affected KPI targets are resolved from `kpi_definitions.formula_inputs` where
  mapped `input_def_id` includes the triggering input definition.
- Only active KPI definitions with valid formula metadata are eligible.

## Formula Version Contract

- Worker snapshots formula definition version at trigger/attempt creation.
- Attempt execution must use that snapshotted version even if KPI definition
  changes later.
- Attempt audit must store the formula version used.

## Input Resolution Contract

- Formula variable values are resolved from source inputs constrained to the
  same reporting scope.
- When `kpi.agg_level_id > input.agg_level_id`, worker must use report-period
  sum for that `input_def_id`.
- Report-period sum includes all saved statuses for rows where
  `is_deleted = false` and `is_relevant = true`.
- If any required mapped input is missing for roll-up evaluation, attempt fails.

## Concurrency Contract

- If one calculation is already processing for a KPI scope, additional triggers
  for that scope are not executed immediately; one deferred follow-up
  recalculation marker is retained and executed after completion.
- Duplicate completed KPI writes for the same scope are not permitted.

## Retry Contract

- Transient failures (for example temporary DB/network faults) retry up to 3
  times with backoff.
- If retries are exhausted, attempt status becomes failed with failure reason.

## Persistence Contract

- On success, worker writes calculated value to KPI storage (`kpi.actual_value`)
  for target KPI definition and report period.
- On failure, worker must not persist a completed KPI value for that attempt.
- Every attempt must persist audit fields: status, timestamps, failure
  reason/type, retry count, formula version.

## Status Contract

Calculation status enum:

```ts
type KpiCalculationStatus = "pending" | "processing" | "completed" | "failed";
```

Failure type enum:

```ts
type KpiCalculationFailureType =
  | "missing-input"
  | "formula-invalid"
  | "evaluation-error"
  | "transient-infra"
  | "unexpected";
```

Rules:

- `failureReason` is mandatory when status is `failed`.
- `retryCount` increments only for transient failures.
- `completed` attempts must include `completedAt` and calculated value.

## Security and Authorization Contract

- Worker trigger entrypoints must be reachable only through authenticated and
  authorized server flows.
- Read/write operations must remain within authorized reporting scope.
- Secrets/config for worker infrastructure must be sourced from environment
  variables.

## Observability Contract

- Operations view/logging must provide per-attempt status timeline and reason
  for failures.
- Monitoring should expose trigger latency and attempt completion latency for
  success criteria tracking.
