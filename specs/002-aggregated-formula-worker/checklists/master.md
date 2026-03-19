# Master Checklist: Aggregated Formula Worker Processing

**Purpose**: Unified pre-implementation and release-gate checklist for quality,
consistency, scalability, and operations readiness **Created**: 2026-03-19
**Feature**: [spec.md](../spec.md)

## Core Requirements and Consistency

- [x] CHK001 Are all clarification decisions represented as explicit functional
      requirements? [Completeness, Spec §Clarifications, Spec §FR-013..FR-021]
- [x] CHK002 Is post-commit asynchronous triggering clearly specified and
      consistent across spec, plan, and contract? [Consistency, Spec
      §FR-020..FR-021, Plan §Summary, Contract §Trigger Contract]
- [x] CHK003 Are concurrency semantics explicit for same-scope overlap and
      last-write-wins persistence? [Completeness, Spec §FR-013..FR-014, Contract
      §Concurrency Contract]
- [x] CHK004 Are scope boundaries unambiguous for dependency reads and target
      writes? [Clarity, Spec §FR-003, Data Model §ReportingScope, Contract
      §Security and Authorization Contract]
- [x] CHK005 Is source-snapshot evaluation behavior precise and conflict-free
      with in-run updates? [Clarity, Spec §FR-017..FR-018, Contract §Evaluation
      Contract]
- [x] CHK006 Are skip reasons consistently defined for missing value, unknown
      variable, and evaluation error? [Consistency, Spec §FR-016, Spec §FR-019,
      Contract §Error Handling Contract]
- [x] CHK007 Are per-target outcome requirements complete for both calculated
      and skipped states? [Completeness, Spec §FR-009, Contract §Outcome
      Contract]

## Acceptance and Coverage Quality

- [x] CHK008 Are user stories independently testable with clear acceptance
      scenarios and evidence expectations? [Acceptance Criteria, Spec §User
      Stories]
- [x] CHK009 Are measurable outcomes defined without relying on undefined
      implementation instrumentation? [Measurability, Spec §SC-001..SC-005]
- [x] CHK010 Is the 30-second target tied to a clearly scoped run definition and
      trigger condition? [Measurability, Spec §SC-003, Data Model
      §AggregatedCalculationRun]
- [x] CHK011 Are primary, alternate, and exception scenarios covered for
      eligible compute, skips, and concurrent overlap? [Coverage, Spec §User
      Story 1..3, Spec §FR-013..FR-016]
- [ ] CHK012 Are edge cases specified for no-variable formulas, non-finite
      results, and repeated unknown variables? [Edge Case, Spec §Edge Cases,
      Gap]

## Scalability and Throttling

- [ ] CHK013 Are maximum expected concurrent same-scope run levels explicitly
      defined? [Gap, Plan §Technical Context]
- [ ] CHK014 Is burst-trigger handling behavior specified (queueing, backlog
      policy, or explicit out-of-scope)? [Gap, Research §Decision 3]
- [ ] CHK015 Are rate-limiting and deduplication policies for rapid repeated
      saves explicitly defined? [Gap, Spec §FR-013, Contract §Concurrency
      Contract]
- [ ] CHK016 Are overload controls (backoff, shedding, fairness across scopes)
      specified or intentionally deferred with rationale? [Gap, Non-Functional]
- [ ] CHK017 Are resource constraints (CPU, memory, DB pressure) quantified or
      clearly marked as deferred? [Gap, Plan §Technical Context]

## Reliability, Recovery, and Observability

- [ ] CHK018 Are requirements defined for partial-write interruption and
      recovery behavior? [Gap, Reliability]
- [ ] CHK019 Is retry policy clear for transient failures vs deterministic
      formula errors? [Gap, Error Handling]
- [x] CHK020 Are idempotency/replay expectations documented for repeated
      triggers in same scope? [Measurability, Spec §FR-011]
- [ ] CHK021 Are mandatory run-level telemetry fields and target-level
      diagnostics explicitly required? [Completeness, Contract §Observability
      Contract]
- [ ] CHK022 Are alert thresholds specified for skip spikes, evaluation errors,
      and latency breaches? [Gap, Observability]
- [ ] CHK023 Is operational review visibility sufficient for triage without
      source-code inspection? [Clarity, Spec §FR-010]

## Security and Release Evidence

- [x] CHK024 Are authorization and scope controls explicit for background
      execution of both reads and writes? [Completeness, Spec §CA-001, Contract
      §Security and Authorization Contract]
- [ ] CHK025 Are auditability and sensitive-data logging boundaries clearly
      specified? [Gap, Spec §CA-001..CA-002]
- [ ] CHK026 Are release-gate evidence requirements complete for
      lint/build/tests and load-oriented verification? [Completeness, Spec
      §CA-003, Quickstart §Validation Commands]
- [ ] CHK027 Are rollback/feature-disable criteria defined if production
      thresholds are violated? [Gap, Recovery]
- [ ] CHK028 Are deferred decisions tracked with explicit owner and target
      phase/date? [Traceability, Gap]

## Notes

- Use this as the primary checklist for both author review and release sign-off.
- Keep [planning.md](planning.md) and [release-gate.md](release-gate.md) as
  source checklists if deeper drill-down is needed.
- Mark completed items with [x] and attach evidence links inline.

## Evidence Links

- Implementation progress: [tasks.md](../tasks.md)
- Validation evidence and runbook notes: [quickstart.md](../quickstart.md)
- Planning checklist source: [planning.md](planning.md)
- Release gate checklist source: [release-gate.md](release-gate.md)
