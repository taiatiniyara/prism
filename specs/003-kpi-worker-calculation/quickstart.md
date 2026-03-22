# Quickstart: KPI Background Calculation Worker

## Goal

Implement and validate asynchronous KPI recalculation triggered by data-entry
input writes with aggregation-level roll-up, formula-version snapshot, in-flight
duplicate suppression plus deferred follow-up recalculation, and bounded
retries.

## Prerequisites

- Node.js and npm installed
- Project dependencies installed (`npm install`)
- Database configured for Drizzle connection
- Working branch: `003-kpi-worker-calculation`

## Implementation Steps

1. Add/extend server-side trigger path after successful data-entry create/update
   commit.
2. Implement KPI target resolution from `kpi_definitions.formula_inputs` by
   `input_def_id`.
3. Implement formula-version snapshot capture at trigger/attempt creation.
4. Implement worker attempt lifecycle with statuses: pending, processing,
   completed, failed.
5. Add roll-up rule for `kpi agg_level_id > input agg_level_id`:

- sum full report-period values for matching `input_def_id`
- include all saved statuses
- fail attempt if required mapped period input is missing

6. Enforce same-scope in-flight behavior: suppress immediate duplicate trigger
   execution and run deferred follow-up recalculation after completion.
7. Implement transient failure retries up to 3 attempts with backoff.
8. Persist successful computed KPI values to `kpi` and persist attempt audit
   details for all outcomes.

## Validation Commands

Run the full gate:

```bash
npm run lint
npm run build
npm run test
```

Targeted suites while iterating:

```bash
npm run test:unit
npm run test:integration
```

Focused KPI worker verification commands:

```bash
npm run test -- test/unit/data-entry/kpi-worker/*.test.ts
npm run test -- test/integration/data-entry/kpi-worker-*.test.ts
```

## Verification Checklist

- Submitting or updating a data entry triggers asynchronous KPI processing.
- Affected KPI list matches definitions mapped to triggering `input_def_id`.
- Formula version used by attempt matches trigger-time snapshot, not
  post-trigger edits.
- Roll-up path sums full report period for lower-level inputs when KPI agg level
  is higher.
- Roll-up includes only records with `is_deleted = false` and
  `is_relevant = true`.
- Missing required period input causes failed attempt and no completed KPI
  write.
- Additional same-scope triggers are not executed immediately while one attempt
  is processing, and a deferred follow-up recalculation runs after completion.
- Transient failures retry up to 3 times with backoff and then fail with reason
  if exhausted.
- Successful attempts persist KPI result and completion timestamps.
- Enqueue latency meets SC-001 threshold (99% <= 30s) in benchmark run.
- Completion latency meets SC-002 threshold (95% <= 2m) in benchmark run.

## Suggested Test Cases

1. Unit: KPI impact resolution from formula input mappings.
2. Unit: roll-up sum calculation across full period with mixed statuses.
3. Unit: roll-up filter behavior (`is_deleted`, `is_relevant`) for inclusion.
4. Unit: missing required period input -> failed attempt behavior.
5. Unit: formula-version snapshot immutability across definition changes.
6. Integration: post-commit trigger and asynchronous execution does not block
   save response.
7. Integration: in-flight same-scope duplicate suppression with deferred
   follow-up recalculation behavior.
8. Integration: transient retry policy (3 attempts with backoff).
9. Integration: successful persistence to KPI table and audit record integrity.
10. Integration benchmark: enqueue latency target (SC-001).
11. Integration benchmark: completion latency target (SC-002).
