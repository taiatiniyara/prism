# Implementation Plan: KPI Background Calculation Worker

**Branch**: `003-kpi-worker-calculation` | **Date**: 2026-03-23 | **Spec**:
`specs/003-kpi-worker-calculation/spec.md` **Input**: Feature specification from
`/specs/003-kpi-worker-calculation/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See
`.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a server-side asynchronous KPI calculation worker triggered by
data-entry submit/update events. The worker resolves affected KPIs from
`kpi_definitions.formula_inputs`, snapshots formula version at trigger time,
evaluates formulas using reporting-scope inputs, applies aggregation roll-up
when `kpi_definitions.agg_level_id > input_definitions.agg_level_id`, stores
calculated KPI values in `kpi`, and records per-attempt status/audit details.
Missing required period inputs fail the calculation attempt, same-scope
in-flight duplicate trigger execution is suppressed with one deferred follow-up
recalculation after completion, and transient failures are retried up to 3 times
with backoff.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App
Router  
**Primary Dependencies**: Next.js server routes/actions, Drizzle ORM, pg,
better-auth, Tailwind CSS, shadcn-compatible UI primitives  
**Storage**: PostgreSQL via Drizzle schema modules (`db/schema/*`)  
**Testing**: Vitest (`npm test`, `npm run test:unit`,
`npm run test:integration`) plus `npm run lint` and `npm run build`  
**Target Platform**: Next.js web application runtime for authenticated PRISM
users  
**Project Type**: Monolithic web application with server-side domain logic and
App Router UI  
**Performance Goals**: 99% of accepted submissions enqueue calculation in <=30s;
95% of successful calculations complete in <=2 minutes  
**Constraints**: Post-commit async trigger, formula-version snapshot at trigger
time, suppress immediate duplicate in-flight scope execution with deferred
follow-up recalculation, fail on missing required roll-up inputs, retry
transient failures 3 times with backoff  
**Scale/Scope**: KPI calculations for affected KPI definitions per report period
scope (report period + dimensional qualifiers) on each input submit/update

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Type safety and architecture gate**: Confirm server-first placement for
  business logic, strict TypeScript compliance, and clear separation between UI
  and domain logic.
- **Security gate**: Identify authn/authz controls, secret handling approach,
  and input validation boundaries for each user flow.
- **Data integrity gate**: Document schema and mutation impact, including
  Drizzle update path and rollback/mitigation considerations for
  reporting-critical data.
- **Quality gate**: Define required validation commands (`npm run lint`,
  `npm run build`) and list automated tests required for behavior-changing work.
- **UI system gate**: Confirm affected UI uses Tailwind CSS and
  shadcn-compatible components, and identify reusable component extraction for
  repeated patterns.
- **UX and accessibility gate**: Define how loading, empty, error, and
  keyboard-accessible interaction states will be delivered for affected screens.

### Pre-Research Gate Review

- **Type safety and architecture gate**: PASS. Worker orchestration,
  formula-resolution, and KPI persistence remain in server-side modules under
  `app/api/data-entry` and shared domain services; UI remains display/status
  only.
- **Security gate**: PASS. Trigger source remains authenticated data-entry
  flows; any worker trigger endpoint/service executes with existing authn/authz
  checks and does not expose open mutation surfaces.
- **Data integrity gate**: PASS with action. Feature mutates KPI outcomes and
  adds calculation-attempt audit behavior; any schema additions must use Drizzle
  schema updates and `npm run db-push` with rollback notes.
- **Quality gate**: PASS with action. Delivery requires `npm run lint`,
  `npm run build`, and Vitest coverage for trigger behavior, roll-up rules,
  version snapshotting, in-flight dedupe, and retry policy.
- **UI system gate**: PASS. If status indicators are surfaced in data-entry/KPI
  screens, they will use existing Tailwind + shadcn component primitives.
- **UX and accessibility gate**: PASS with action. Any surfaced status state
  must include loading, success, and failure text states with keyboard-readable
  labels.

### Post-Design Gate Review

- **Type safety and architecture gate**: PASS. `data-model.md` and `contracts/`
  formalize typed worker boundaries and server-owned lifecycle states.
- **Security gate**: PASS. Contract constrains triggering and writes to
  authorized reporting scope and existing protected flows.
- **Data integrity gate**: PASS. Design captures trigger-time formula version,
  missing-input failure behavior, and auditable attempt history requirements.
- **Quality gate**: PASS. `quickstart.md` includes full validation command set
  and behavior-focused verification scenarios.
- **UI system gate**: PASS. No design-system deviations required for core worker
  delivery.
- **UX and accessibility gate**: PASS. Design supports clear async status and
  failure messaging where shown.

## Project Structure

### Documentation (this feature)

```text
specs/003-kpi-worker-calculation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── kpi-calculation-worker.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── api/
│   └── data-entry/
│       └── ...
├── data-entry/
│   ├── enter-data/
│   │   ├── page.tsx
│   │   └── service.ts
│   ├── service.ts
│   └── types.ts
└── dashboard/
    └── ...
db/
├── connection.ts
└── schema/
    ├── dataEntry.ts
    └── kpi.ts
lib/
└── ...
test/
├── integration/
└── unit/
```

**Structure Decision**: Use the existing Next.js App Router monolith and place
worker orchestration in server-side data-entry/KPI domain services and API
handlers, with schema updates under `db/schema/*` and behavior validation in
`test/unit` and `test/integration`.

## Complexity Tracking

No constitution violations identified; no complexity exceptions required.
