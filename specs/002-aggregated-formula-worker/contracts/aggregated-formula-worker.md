# Contract: Aggregated Formula Worker Processing

## Scope

Defines behavior contract for asynchronous aggregated formula processing
triggered by data-entry writes.

## Trigger Contract

### Input Event

- Event source: successful data-entry write
- Trigger timing: post-commit only
- Trigger mode: asynchronous (non-blocking for save response)

### Trigger Guarantees

- Save response MUST complete without waiting for worker completion.
- Worker run MUST be scoped to the same reporting context as the triggering
  write.

## Eligibility Contract

A target is eligible for evaluation only when all are true:

- input definition has `aggregated = true`
- formula is non-empty
- formula variable references are extracted successfully

Ineligible targets are excluded from attempted calculation.

## Dependency Resolution Contract

- Variable values are read from data-entry values in the same reporting scope.
- Unknown variable references are treated as missing dependencies.
- Null/undefined dependency values are treated as missing dependencies.

## Evaluation Contract

- Each run MUST evaluate using a consistent source snapshot.
- Within the same run, newly computed aggregated values MUST NOT be consumed by
  other formula evaluations.
- Runtime evaluation failures for one target MUST NOT fail the full run.

## Concurrency Contract

- Concurrent runs for the same reporting scope are permitted.
- If overlapping runs write the same aggregated target, persistence behavior is
  last completed write wins.

## Outcome Contract

Per-target outcome shape:

```ts
interface TargetOutcome {
  runId: string;
  inputDefId: number;
  status: "calculated" | "skipped";
  reason?: "missing-value" | "unknown-variable" | "evaluation-error";
}
```

Rules:

- `reason` is mandatory when `status = "skipped"`.
- `calculated` writes target value back to the data-entry table for the same
  report period under the target formula input definition id (`inputDefId`) and
  reporting scope.
- `skipped` preserves existing target value.

## Error Handling Contract

- Missing dependency: skip target, reason `missing-value`, continue run.
- Unknown variable: skip target, reason `unknown-variable`, continue run.
- Evaluation runtime error: skip target, reason `evaluation-error`, continue
  run.

## Security and Authorization Contract

- Processing must execute under authorized data-entry workflow boundaries.
- Reads/writes must not escape triggering user-permitted reporting scope.
- Non-aggregated records must not be mutated by this feature.

## Observability Contract

- Processing results must be available for operational review per run.
- Review must expose calculated/skipped count and target-level skip reasons.
