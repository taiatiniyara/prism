# Implementation Plan: Review KPI Values Workspace

**Branch**: `[005-review-kpi-values]` | **Date**: 2026-03-24 | **Spec**:
`specs/005-review-kpi-values/spec.md` **Input**: Feature specification from
`/specs/005-review-kpi-values/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See
`.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver a complete review KPI workspace at `/data-entry/review-kpi` with
cookie-backed filters, KPI row rendering (inputs/formula/result), input editing,
per-input discussion, and near-real-time cross-user synchronization.
Implementation will follow existing server-action and route-handler patterns,
reuse the shared data-entry filtering model, and add optimistic concurrency
guards so stale edits are rejected and re-applied intentionally.

## Technical Context

**Language/Version**: TypeScript (strict), React 19.2.3, Next.js 16.1.1  
**Primary Dependencies**: Next App Router, Drizzle ORM, `pg`, Tailwind CSS,
shadcn-style UI primitives, better-auth  
**Storage**: PostgreSQL via Drizzle schema (`data_entries`, `input_definitions`,
`kpi`, `kpi_definitions`, managed lists)  
**Testing**: Vitest (`npm run test`, `npm run test:unit`,
`npm run test:integration`) + lint/build gates  
**Target Platform**: Server-rendered web app (Node runtime for Next.js routes)  
**Project Type**: Monolithic Next.js web application  
**Performance Goals**: Filter refresh p95 <= 2s; cross-user update visibility
p95 <= 2s; comment publish visibility <= 3s  
**Constraints**: Server-first authorization and validation; optimistic
concurrency required for input updates; accessibility states for loading/empty/
error/sync status; no hardcoded secrets  
**Scale/Scope**: One new production page (`/data-entry/review-kpi`), new
review-focused API/route contracts, extensions to existing data-entry service
flows, and targeted tests for filter/edit/comment/sync behavior

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

### Pre-Design Constitution Check

- **Type safety and architecture gate**: PASS. Business rules remain in server
  actions and route services; client components stay presentation-focused and
  consume typed view models.
- **Security gate**: PASS. Read endpoints require authenticated user; edit and
  comment mutations enforce role-based authorization and input validation.
- **Data integrity gate**: PASS. Core mutations target existing `data_entries`
  rows and trigger KPI recalculation; optimistic concurrency is mandatory to
  prevent stale overwrites. Drizzle update path remains `npm run db-push` if
  schema changes are needed.
- **Quality gate**: PASS. Required evidence: `npm run lint`, `npm run build`,
  plus unit/integration tests for filter cascade, conflict handling, and sync
  updates.
- **UI system gate**: PASS. Implementation uses existing Tailwind and shared UI
  components in `components/ui` and data-entry filter components.
- **UX and accessibility gate**: PASS. Plan includes keyboard-operable filter
  controls, accessible edit/comment flows, and explicit loading/empty/error/
  re-sync states.

## Project Structure

### Documentation (this feature)

```text
specs/005-review-kpi-values/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── data-entry/
│   ├── review-kpi/
│   │   ├── page.tsx
│   │   ├── service.ts                # new
│   │   ├── actions.ts                # new
│   │   └── types.ts                  # new
│   ├── enter-data/
│   │   └── service.ts                # reuse patterns for context + mutations
│   ├── filterContext.cookies.ts      # reuse cookie persistence
│   ├── filterContext.rules.ts        # reuse category/subcategory cascade
│   └── constants.ts
│
├── api/
│   └── data-entry/
│       └── review-kpi/
│           ├── route.ts              # new list/read contract
│           ├── events/route.ts       # new sync contract
│           └── inputs/
│               └── [dataEntryId]/
│                   ├── route.ts      # new input update contract
│                   └── comments/route.ts  # new input comment contract
│
components/
├── data-entry/
│   ├── filterSelectors.tsx           # reused top filters
│   ├── review-kpi-row.tsx            # new row layout
│   └── input-comment-thread.tsx      # new comment UI
└── ui/                               # existing primitives

db/
└── schema/
    ├── dataEntry.ts                  # potential comment/concurrency field reuse
    └── kpi.ts

test/
├── integration/
│   └── data-entry/review-kpi/        # new integration tests
└── unit/
    └── data-entry/review-kpi/        # new service + conflict tests
```

**Structure Decision**: Use the existing Next.js monolith structure, adding a
feature-local `app/data-entry/review-kpi` module plus narrowly scoped API routes
and reusable data-entry components.

## Phase 0 Research Output

Research findings are documented in `specs/005-review-kpi-values/research.md`
and resolve the implementation choices for synchronization, conflict handling,
filter reuse, and contract shape.

## Phase 1 Design Output

- Data model: `specs/005-review-kpi-values/data-model.md`
- Contracts: `specs/005-review-kpi-values/contracts/review-kpi.openapi.yaml`
- Validation quickstart: `specs/005-review-kpi-values/quickstart.md`

### Post-Design Constitution Check

- **Type safety and architecture gate**: PASS. Contracts and data model keep
  mutation logic in server-side modules and expose typed payloads.
- **Security gate**: PASS. All write flows require authenticated role checks;
  read/sync contracts scoped by authorized filters.
- **Data integrity gate**: PASS. Concurrency token (`updatedAt`) and
  conflict-response workflow prevent stale overwrites; recalculation remains
  deterministic.
- **Quality gate**: PASS. Quickstart includes lint/build/test command set and
  behavior-focused test cases.
- **UI system gate**: PASS. Design calls for extending existing data-entry
  components and shadcn-compatible primitives, not bespoke UI stacks.
- **UX and accessibility gate**: PASS. Loading, empty, error, conflict, and sync
  state announcements are explicitly planned.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| None      | N/A        | N/A                                  |
