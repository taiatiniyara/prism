# Data Model: KPI Background Calculation Worker

## Entity: KpiCalculationTrigger

Represents one accepted input create/update event that requests KPI
recalculation.

Fields:

- triggerId: string
- sourceDataEntryId: string
- reportPeriodId: number
- inputDefId: number
- scope: KpiComputationScope
- triggeredAt: string (ISO timestamp)
- triggeredByUserId?: string

Validation rules:

- Trigger is created only after source write commit succeeds.
- Trigger must include enough scope to resolve affected KPI definitions.

## Entity: KpiComputationScope

Defines the reporting boundary used for source-value resolution and KPI write.

Fields:

- reportPeriodId: number
- organizationId?: number | null
- serviceAreaId?: number | null
- energyResourceId?: number | null
- energyProviderId?: number | null
- energySourceId?: number | null
- customerTypeId?: number | null
- paymentModeId?: number | null

Validation rules:

- Reads and writes for one attempt must stay within one scope.
- Scope dimensions derive from triggering data entry context.
- Scope must include organizationId when report period partitioning is
  organization-specific.

## Entity: AffectedKpiDefinition

Represents one KPI definition selected for recalculation by input mapping.

Fields:

- kpiDefId: number
- aggLevelId: number
- formulaText: string
- formulaInputs: FormulaInputReference[]
- formulaVersion: string
- isActive: boolean

Validation rules:

- Definition is eligible only when active and formula/formula-input metadata is
  valid.
- `formulaVersion` is snapshotted at trigger/attempt creation.

## Entity: FormulaInputReference

Represents one variable-to-input mapping required by KPI formula.

Fields:

- variableName: string
- inputDefId: number
- inputAggLevelId?: number | null

Validation rules:

- Every formula variable must resolve to one mapped input definition.
- Unresolvable references result in failed attempt outcome for that KPI target.

## Entity: KpiCalculationAttempt

Represents one worker execution lifecycle for one KPI target and scope.

Fields:

- attemptId: string
- triggerId: string
- kpiDefId: number
- reportPeriodId: number
- scope: KpiComputationScope
- status: "pending" | "processing" | "completed" | "failed"
- formulaVersion: string
- startedAt?: string
- completedAt?: string
- retryCount: number
- maxRetries: number (fixed at 3)
- failureReason?: string
- failureType?: "missing-input" | "formula-invalid" | "evaluation-error" |
  "transient-infra" | "unexpected"

Validation rules:

- At most one attempt for same KPI scope may be `processing` at a time.
- New triggers for same KPI scope are not executed immediately while status is
  `processing`; one deferred follow-up recalculation marker is retained.
- Attempt transitions to `failed` only after retry budget exhausted for
  transient errors.

State transitions:

- pending -> processing -> completed
- pending -> processing -> failed
- processing -> pending (retry scheduled, transient errors only)
- processing -> pending (deferred follow-up recalculation scheduled)

## Entity: PeriodInputAggregate

Represents aggregated source value used when KPI agg level is greater than input
agg level.

Fields:

- reportPeriodId: number
- inputDefId: number
- scope: KpiComputationScope
- includedStatuses: "all-saved"
- summedValue: string
- missingRequired: boolean

Validation rules:

- Aggregation scans full report period.
- Includes all saved statuses (draft/submitted/approved/etc.) per clarification.
- If any required mapped input is missing, attempt fails and no completed KPI
  value is persisted.

## Entity: KpiResultRecord

Represents persisted KPI output in `kpi` table for one KPI definition and report
period.

Fields:

- kpiId: string
- reportPeriodId: number
- kpiDefId: number
- actualValue: string
- targetValue?: string | null
- comments?: string | null
- isRelevant: boolean
- isFavourite: boolean
- writtenAt: string (ISO timestamp)

Validation rules:

- Write occurs only on successful calculation completion.
- Only one active authoritative result per KPI definition and reporting scope.

## Relationship Summary

- One `KpiCalculationTrigger` can fan out to many `AffectedKpiDefinition`
  targets.
- Each target produces one or more `KpiCalculationAttempt` records (retries
  share logical target, unique attempt ids).
- `KpiCalculationAttempt` consumes many `FormulaInputReference` values.
- `PeriodInputAggregate` is derived per input reference where roll-up rule
  applies.
- Successful attempts upsert one `KpiResultRecord`; failed attempts update audit
  state only.
