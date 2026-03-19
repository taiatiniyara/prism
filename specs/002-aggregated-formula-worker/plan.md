# Implementation Plan: Aggregated Formula Worker Processing

**Branch**: `002-aggregated-formula-worker` | **Date**: 2026-03-19 | **Spec**:
`specs/002-aggregated-formula-worker/spec.md` **Input**: Feature specification
from `/specs/002-aggregated-formula-worker/spec.md`

## Summary

Implement asynchronous post-save aggregated formula computation for data-entry
workflows. The system will select only `aggregated = true` inputs with formulas,
resolve variable dependencies from source data-entry values in the same
reporting scope, compute eligible targets from a consistent source snapshot,
skip targets with missing/unknown dependencies or runtime evaluation errors, and
record per-target outcomes. Processing will allow concurrent runs for the same
scope with last-write-wins persistence behavior.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App
Router  
**Primary Dependencies**: Next.js server actions/API routes, Drizzle ORM, pg,
better-auth, Tailwind CSS, shadcn-compatible UI primitives  
**Storage**: PostgreSQL via Drizzle schema modules in `db/schema/*`  
**Testing**: Vitest (`npm test`, `npm run test:unit`,
`npm run test:integration`), plus `npm run lint` and `npm run build`  
**Target Platform**: Next.js web application runtime for authenticated PRISM
users  
**Project Type**: Monolithic web application (App Router) with server-side
business logic  
**Performance Goals**: At least 95% of mixed processing runs complete within 30
seconds from data-entry submission (SC-003)  
**Constraints**: Async trigger after commit, non-blocking save response,
same-scope concurrent runs permitted, in-run source snapshot semantics,
skip-and-continue error handling  
**Scale/Scope**: Data-entry save path and aggregated target evaluation for
formulas within one reporting scope per trigger

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Research Gate Review

- **Type safety and architecture gate**: PASS. Plan places formula orchestration
  and data mutation logic on the server (`app/data-entry/**/service.ts`) with
  typed domain contracts and keeps UI/status rendering presentation-focused.
- **Security gate**: PASS. Triggering remains within authenticated/authorized
  data-entry flows and scope-bound resolution must use current user permissions;
  no client-side authorization logic introduced.
- **Data integrity gate**: PASS. Feature mutates aggregated data-entry targets
  only and explicitly preserves non-aggregated records; no schema change is
  required for core behavior, but any outcome/audit persistence schema additions
  must go through Drizzle update path (`db/schema/*` + `npm run db-push`).
- **Quality gate**: PASS with action. Delivery validation includes
  `npm run lint`, `npm run build`, and automated tests covering calculation
  eligibility, skip behavior, concurrent last-write-wins semantics, and async
  trigger behavior.
- **UI system gate**: PASS. Any user-visible processing status uses existing
  Tailwind and shadcn-style patterns in current data-entry views.
- **UX and accessibility gate**: PASS with action. Non-blocking save flow must
  preserve accessible feedback states for processing outcomes where surfaced.

### Post-Design Gate Review

- **Type safety and architecture gate**: PASS. `data-model.md` formalizes run
  scope, snapshot, and outcome entities; contract defines server boundaries for
  trigger and processing semantics.
- **Security gate**: PASS. Contract requires scope-constrained dependency lookup
  and mutation paths only within authorized reporting context.
- **Data integrity gate**: PASS. Design locks in snapshot-based evaluation and
  explicit skip paths for unknown/missing dependencies and runtime errors.
- **Quality gate**: PASS. `quickstart.md` includes lint/build/test commands and
  targeted manual verification flows.
- **UI system gate**: PASS. No deviation from existing design system is required
  for feature completion.
- **UX and accessibility gate**: PASS. Design includes non-blocking save
  behavior and outcome visibility expectations without introducing inaccessible
  blocking flows.

## Project Structure

### Documentation (this feature)

```text
specs/002-aggregated-formula-worker/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── aggregated-formula-worker.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── data-entry/
│   ├── enter-data/
│   │   ├── page.tsx
│   │   ├── inputCell.tsx
│   │   └── service.ts
│   ├── service.ts
│   └── types.ts
├── settings/
│   └── inputs/
│       ├── page.tsx
│       ├── formulaBuilder.tsx
│       └── service.ts
db/
├── connection.ts
└── schema/
    └── dataEntry.ts
test/
├── integration/
└── unit/
```

**Structure Decision**: Use the existing single Next.js App Router structure and
implement worker-trigger orchestration within existing data-entry server
services, formula metadata providers, and data-entry schema modules.

## Complexity Tracking

No constitution violations identified; no complexity exceptions required.
