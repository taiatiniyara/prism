# Data Model - Review KPI Values Workspace

## 1. ReviewKpiFilterContext

- Purpose: Active filter scope that controls KPI rows and sync audience.
- Fields:
  - reportTypeId: number
  - reportPeriodId: number
  - kpiCategoryId: number | null
  - kpiSubcategoryId: number | null
  - serviceAreaId: number | null
- Validation:
  - reportTypeId and reportPeriodId are required for data retrieval.
  - kpiSubcategoryId must belong to selected kpiCategoryId via `parent_id`.
  - cookie-restored values must be sanitized against currently active options.

## 2. ReviewKpiRow

- Purpose: Rendered row containing KPI context + values.
- Fields:
  - kpiDefId: number
  - kpiName: string
  - formulaText: string | null
  - categoryId: number | null
  - subcategoryId: number | null
  - reportPeriodId: number
  - serviceAreaId: number | null
  - inputs: ReviewKpiInputValue[]
  - result: ReviewKpiResult
- Relationships:
  - one row references one KPI definition and many input values.

## 3. ReviewKpiInputValue

- Purpose: Editable input displayed under the KPI row.
- Fields:
  - dataEntryId: string
  - inputDefId: number
  - inputName: string
  - value: string | null
  - controlType: "text" | "number" | "boolean" | "select" | "date" |
    "managedLists" | "fallback"
  - comments: InputComment[]
  - updatedAt: string (ISO)
  - updatedById: string | null
- Validation:
  - value must satisfy input definition data type and allowed range constraints.
  - update requests must include concurrency token derived from `updatedAt`.

## 4. ReviewKpiResult

- Purpose: Computed KPI output shown in the right column.
- Fields:
  - kpiId: string | null
  - value: string | null
  - status: "calculated" | "missing-input" | "stale" | "error"
  - calculatedAt: string | null
  - formulaVersion: string | null

## 5. InputComment

- Purpose: User feedback thread entry attached to one input value.
- Fields:
  - comment: string
  - commenterId: string
  - commenterRole: string
  - date: string (ISO)
  - resolved: boolean | undefined
  - replies: InputComment[] | undefined
- Validation:
  - comment text required, trimmed, non-empty.
  - commenter identity sourced from authenticated session, not client-provided.

## 6. SyncEventEnvelope

- Purpose: Broadcast payload for authorized, filter-scoped realtime updates.
- Fields:
  - eventId: string
  - eventType: "input-updated" | "comment-added" | "kpi-recalculated" |
    "sync-recovered"
  - occurredAt: string (ISO)
  - reportPeriodId: number
  - serviceAreaId: number | null
  - kpiDefId: number
  - inputDefId: number | null
  - dataEntryId: string | null
  - payload: object
- Validation:
  - emitted only after committed mutation.
  - delivered only to authorized sessions whose active filtered result set
    includes the affected KPI/input.

## State Transitions

### A. Input Edit Lifecycle

1. idle -> editing
2. editing -> saving
3. saving -> saved (if concurrency token matches)
4. saving -> conflict (if stale token)
5. conflict -> editing (after latest value reload and user re-apply)

### B. KPI Result Freshness

1. stale (pending worker) -> calculated
2. stale -> error (worker failure)
3. stale -> missing-input (dependency unavailable)

### C. Sync Delivery State

1. connected -> update-received
2. connected -> disconnected
3. disconnected -> reconnecting
4. reconnecting -> connected + sync-recovered (latest snapshot applied)
