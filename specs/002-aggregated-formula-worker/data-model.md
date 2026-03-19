# Data Model: Aggregated Formula Worker Processing

## Entity: AggregatedFormulaTarget

Represents an input definition eligible for worker-driven formula calculation.

Fields:

- inputDefId: number
- aggregated: boolean
- formula: string
- variableReferences: FormulaVariableReference[]
- reportingScope: ReportingScope

Validation rules:

- Target is eligible only when `aggregated = true` and formula is non-empty.
- Target formula must map to at least one resolvable variable reference for
  calculation eligibility.

## Entity: FormulaVariableReference

Represents one variable token extracted from a formula.

Fields:

- variableName: string
- sourceInputDefId?: number
- resolved: boolean
- resolutionReason?: "missing-value" | "unknown-variable"

Validation rules:

- Variable names are case-sensitive according to formula parser rules used by
  implementation.
- Unresolved or unknown variables make target ineligible for calculation in that
  run.

## Entity: ReportingScope

Defines the context boundary for dependency lookup and updates.

Fields:

- reportPeriodId: number
- inputCategoryId?: number | null
- inputSubcategoryId?: number | null
- serviceAreaId?: number | null
- energyResourceId?: number | null
- organizationId?: number | null

Validation rules:

- All dependency reads and target writes in a run must remain within one
  reporting scope.
- Scope is derived from triggering data-entry write context.

## Entity: SourceSnapshot

Immutable snapshot of source values used for all formula evaluations in a single
run.

Fields:

- runId: string
- capturedAt: string (ISO timestamp)
- scope: ReportingScope
- values: Record<string, string | number | null>

Validation rules:

- Snapshot is captured once per run.
- Newly computed aggregated values are excluded from snapshot and not visible
  until a later trigger.

## Entity: AggregatedCalculationRun

Represents one asynchronous processing execution triggered after save commit.

Fields:

- runId: string
- triggeredByDataEntryId?: string
- triggerCommittedAt: string (ISO timestamp)
- startedAt: string (ISO timestamp)
- completedAt?: string (ISO timestamp)
- scope: ReportingScope
- mode: "async-post-commit"
- concurrencyMode: "same-scope-parallel-last-write-wins"

Validation rules:

- Run starts only after triggering write commit is complete.
- Concurrent runs for same scope are allowed.

State transitions:

- queued -> running -> completed
- queued -> running -> completed-with-skips

## Entity: TargetOutcome

Represents per-target result for a run.

Fields:

- runId: string
- inputDefId: number
- status: "calculated" | "skipped"
- reason?: "missing-value" | "unknown-variable" | "evaluation-error"
- previousValue?: string | number | null
- calculatedValue?: string | number | null
- writtenAt?: string (ISO timestamp)

Validation rules:

- `reason` is required when `status = skipped`.
- Calculated outcomes may write target value according to last-write-wins
  persistence.
- Skipped outcomes must not overwrite existing target value.

## Relationship Summary

- `AggregatedCalculationRun` has one `ReportingScope` and one `SourceSnapshot`.
- `AggregatedCalculationRun` processes many `AggregatedFormulaTarget` records.
- Each target has many `FormulaVariableReference` records.
- Each processed target produces one `TargetOutcome`.
- `TargetOutcome` writes only to its corresponding aggregated target record when
  status is `calculated`.
