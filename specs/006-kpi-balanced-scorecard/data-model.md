# Data Model: KPI Balanced Scorecard

## Entity: ScorecardQuery

- Purpose: Captures validated request context used to fetch scorecard results.
- Fields:
  - reportPeriodId: integer, required, > 0
  - reportTypeId: integer, optional, > 0
  - serviceAreaId: integer, optional, > 0
  - kpiCategoryId: integer, optional, > 0
  - kpiSubcategoryId: integer, optional, > 0
- Validation rules:
  - Numeric IDs must be positive integers when present.
  - Subcategory requires category context.
  - Context is sanitized using existing review KPI filter rules before query
    execution.

## Entity: ScorecardKpiRow

- Purpose: Normalized KPI candidate row before aggregation.
- Fields:
  - kpiId: uuid
  - kpiDefinitionId: integer
  - perspectiveLevel: enum (Financial, Customer, Operation, Development)
  - perspectiveWeight: number (0..1)
  - kpiWeight: number (0..1)
  - actualValue: number | null
  - targetValue: number | null
  - status: string | null
  - approvalState: enum (Requested, Pending, Entered, Reviewed, Approved,
    Endorsed)
  - updatedAt: timestamp
  - filterScopeKey: string
- Validation rules:
  - Exactly one selected row per unique `(kpiDefinitionId + filterScopeKey)`
    after dedupe.
  - Only latest approved row survives dedupe.
  - Rows with missing/invalid scoring fields become excluded rows and do not
    enter weighted aggregation.

## Entity: ExcludedScoreRow

- Purpose: Tracks KPI rows excluded from scoring to provide auditability.
- Fields:
  - kpiId: uuid
  - perspectiveLevel: enum
  - reasonCode: enum (`MISSING_TARGET`, `MISSING_ACTUAL`, `INVALID_RANGE`,
    `NOT_APPROVED`, `DUPLICATE_SUPERSEDED`)
  - reasonMessage: string
- Validation rules:
  - Every excluded record must include one reason code.
  - Exclusion reasons are included in detail payload and excluded counts.

## Entity: PerspectiveScore

- Purpose: Aggregated score per perspective.
- Fields:
  - perspectiveLevel: enum
  - perspectiveLabel: string
  - weightedScore: number (0..100)
  - statusBreakdown: object { onTrack: number, atRisk: number, offTrack: number
    }
  - includedCount: integer >= 0
  - excludedCount: integer >= 0
  - totalWeightUsed: number
- Validation rules:
  - `weightedScore` is computed from included rows only.
  - Division by zero is prevented when total weight is 0 (return null score with
    explicit empty state semantics).

## Entity: ScorecardSnapshot

- Purpose: Final response payload for scorecard summary and drilldown.
- Fields:
  - context: ScorecardQuery
  - overallScore: number | null
  - perspectiveScores: PerspectiveScore[]
  - excludedSummary: object { totalExcluded: number, byReason: Record<string,
    number> }
  - generatedAt: timestamp
  - requestToken: string
- Validation rules:
  - Overall score is weighted average of perspective scores using configured
    perspective weights.
  - Snapshot is generated from a single resolved filter context.
  - Last-filter-wins: stale snapshots must not overwrite newer snapshots in UI.

## Relationships

- One `ScorecardSnapshot` has many `PerspectiveScore`.
- One `PerspectiveScore` is derived from many `ScorecardKpiRow` and
  `ExcludedScoreRow`.
- `ScorecardKpiRow` references canonical domain entities in `kpi`,
  `kpi_definitions`, `bsc`, and filter dimensions.

## State Transitions

1. Query received and sanitized.
2. Candidate KPI rows loaded.
3. Dedupe applied (latest approved wins).
4. Invalid rows moved to exclusion set with reason.
5. Perspective scores aggregated.
6. Overall score aggregated.
7. Snapshot returned and rendered if request token is current.
