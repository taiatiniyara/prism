# Release-Gate Checklist: Aggregated Formula Worker Processing

**Purpose**: Validate release-readiness quality for scalability, throttling,
observability, and operational safety **Created**: 2026-03-19 **Feature**:
[spec.md](../spec.md)

## Scalability Requirements

- [ ] CHK001 Are maximum expected concurrent same-scope run counts explicitly
      specified? [Gap, Plan §Technical Context]
- [ ] CHK002 Are run-queue or trigger-backlog behavior requirements defined for
      burst save traffic? [Gap, Research §Decision 3]
- [ ] CHK003 Are requirements defined for behavior when processing duration
      approaches or exceeds the 30-second target? [Clarity, Spec §SC-003]
- [ ] CHK004 Are resource-usage expectations (CPU, memory, DB query pressure)
      quantified or intentionally out of scope? [Gap, Plan §Technical Context]

## Throttling and Trigger Control

- [ ] CHK005 Is rate-limiting policy for repeated triggers in the same scope
      explicitly defined? [Gap, Spec §FR-013]
- [ ] CHK006 Is trigger deduplication policy defined for identical rapid
      consecutive saves? [Gap, Spec §FR-013, Contract §Concurrency Contract]
- [ ] CHK007 Are backoff or shed-load requirements specified for overload
      conditions? [Gap, Plan §Technical Context]
- [ ] CHK008 Is fairness policy defined so one noisy scope cannot starve others?
      [Gap, Non-Functional]

## Observability and Operations

- [ ] CHK009 Are mandatory run-level telemetry fields defined (run id, scope id,
      start/end, duration, outcome counts)? [Completeness, Contract
      §Observability Contract]
- [x] CHK010 Are target-level diagnostics required for every skipped outcome
      with machine-readable reason? [Consistency, Spec §FR-016, Contract
      §Outcome Contract]
- [ ] CHK011 Are alert thresholds defined for elevated skip rates, evaluation
      errors, or run latency breaches? [Gap, Observability]
- [x] CHK012 Is operational review surface requirement specific enough to
      support incident triage without code-level inspection? [Clarity, Spec
      §FR-010]

## Reliability and Recovery

- [ ] CHK013 Are requirements defined for partial-write recovery when a run
      stops mid-processing? [Gap, Reliability]
- [ ] CHK014 Is retry policy explicitly specified for transient infrastructure
      failures versus deterministic formula failures? [Gap, Error Handling]
- [x] CHK015 Are idempotency expectations for reruns of the same trigger context
      documented and testable? [Measurability, Spec §FR-011]
- [x] CHK016 Is data-consistency behavior defined when concurrent runs race and
      complete out of order? [Consistency, Spec §FR-014]

## Security and Compliance Operations

- [ ] CHK017 Are auditability requirements defined for who triggered a run and
      what aggregated targets were written? [Gap, Spec §CA-001, Spec §CA-002]
- [ ] CHK018 Are sensitive-data logging constraints specified for formula values
      and dependency values? [Gap, Security]
- [x] CHK019 Are authorization-check requirements defined for both dependency
      reads and aggregated writes under background execution? [Completeness,
      Spec §CA-001]

## Release Validation Evidence

- [ ] CHK020 Are release-gate acceptance criteria defined for lint/build/test
      plus load-oriented verification scenarios? [Completeness, Spec §CA-003,
      Quickstart §Validation Commands]
- [ ] CHK021 Are measurable pass/fail thresholds defined for latency and
      skip/error rates under representative load? [Measurability, Spec §SC-003]
- [ ] CHK022 Are rollback or feature-disable requirements defined if production
      metrics violate thresholds? [Gap, Recovery]
- [ ] CHK023 Are post-release verification checkpoints defined for first-run,
      first-hour, and first-day behavior? [Gap, Operations]

## Ambiguities and Deferred Decisions

- [ ] CHK024 Are all deferred items (scalability, throttling, alerting) tracked
      with explicit owner and target phase? [Traceability, Gap]
- [ ] CHK025 Is any conflict unresolved between non-blocking save UX and
      guaranteed processing timeliness? [Conflict, Spec §FR-021, Spec §SC-003]
- [ ] CHK026 Is any conflict unresolved between last-write-wins and
      deterministic audit replay expectations? [Conflict, Spec §FR-014]

## Notes

- Use this checklist as a strict sign-off gate before implementation freeze or
  release.
- Mark completed items with [x] and attach evidence links next to each checked
  item.
