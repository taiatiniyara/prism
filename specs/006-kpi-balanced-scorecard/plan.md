# Implementation Plan: KPI Balanced Scorecard

**Branch**: `006-kpi-balanced-scorecard` | **Date**: 2026-03-26 | **Spec**:
`/specs/006-kpi-balanced-scorecard/spec.md` **Input**: Feature specification
from `/specs/006-kpi-balanced-scorecard/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See
`.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver a balanced scorecard view for KPI review workflows that computes
perspective and overall scores using configured weights, reuses the current
data-entry filter context, and provides transparent drilldown for contributing
KPIs and excluded rows. The technical approach is to add a dedicated read
service and API route under the existing data-entry module, enforce server-side
authz and validation in route/service boundaries, reuse existing filter and
status UI patterns, and ensure deterministic aggregation rules (latest-approved
dedupe, invalid-row exclusion, and last-filter-wins).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1  
**Primary Dependencies**: Next.js App Router, Drizzle ORM, pg, Tailwind CSS 4,
shadcn-style component primitives, better-auth  
**Storage**: PostgreSQL via Drizzle schema under `db/schema`  
**Testing**: Vitest (`npm run test`, `npm run test:unit`,
`npm run test:integration`) and Testing Library  
**Target Platform**: Web application (server-rendered and API routes on Node
runtime)  
**Project Type**: Monolithic Next.js web application  
**Performance Goals**: Scorecard summary load p95 <= 3s for a representative
monthly review dataset profile (2,000 KPI candidate rows across 4 perspectives,
including approximately 20% excluded rows), aligned to SC-001  
**Constraints**: Server-side authz required; deterministic weighted scoring;
latest-approved dedupe; invalid-row exclusion with reasons; last-filter-wins on
rapid filter changes  
**Scale/Scope**: One new scorecard read flow, one scorecard API surface, reused
existing KPI/data-entry datasets and filters for monthly operational reporting

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Type safety and architecture gate**: PASS. Scoring and dedupe logic stays in
  server-side service modules under `app/data-entry`, API route remains thin,
  and client components remain presentation-focused with typed view models.
- **Security gate**: PASS. API route requires current user lookup and role-aware
  access checks (same pattern as review KPI route), with strict query
  validation/sanitization before service execution.
- **Data integrity gate**: PASS. Primary design is read-only over canonical KPI,
  data entry, and BSC mapping entities. If schema adjustments are needed (for
  approved mapping metadata), they must go through Drizzle schema update path
  and documented migration notes.
- **Quality gate**: PASS. Required validation is `npm run lint`,
  `npm run build`, plus automated unit/integration tests for weighting, dedupe,
  exclusion, filter behavior, and last-filter-wins response handling.
- **UI system gate**: PASS. Scorecard UI uses Tailwind and existing shadcn-style
  primitives; status badges and filter selectors are reused from data-entry
  component patterns, extracting shared scorecard summary/detail components.
- **UX and accessibility gate**: PASS. Loading, empty, and error states are
  defined for summary and details; keyboard navigation and screen-reader labels
  are required for perspective cards and detail toggles.

## Project Structure

### Documentation (this feature)

```text
specs/006-kpi-balanced-scorecard/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md             # created later by /speckit.tasks
```

### Source Code (repository root)

```text
app/
├── data-entry/
│   ├── review-kpi/
│   └── balanced-scorecard/           # new feature page/service wiring
└── api/
  └── data-entry/
    └── balanced-scorecard/
      └── route.ts              # new scorecard query endpoint

components/
└── data-entry/
  ├── filterSelectors.tsx           # reuse
  ├── scorecard-summary.tsx         # new reusable summary cards
  └── scorecard-detail-panel.tsx    # new reusable drilldown panel

db/
└── schema/
  └── kpi.ts                        # existing KPI + BSC mapping entities

test/
├── unit/
│   └── data-entry/
│       └── balanced-scorecard/
└── integration/
  └── api/
    └── data-entry/
      └── balanced-scorecard/
```

**Structure Decision**: Use the existing Next.js app structure and extend the
current data-entry module with a dedicated scorecard route/service pair plus
reusable scorecard components under `components/data-entry`. Keep read logic in
server services and avoid introducing a separate backend project.

## Complexity Tracking

No constitution violations identified at planning time.

## Post-Design Constitution Check

- **Type safety and architecture gate**: PASS. Data-model and contracts keep
  server-only scoring logic and typed DTO boundaries.
- **Security gate**: PASS. Contract requires authenticated requests and explicit
  forbidden/unauthorized responses.
- **Data integrity gate**: PASS. Design documents deterministic read-time
  aggregation and no implicit write path.
- **Quality gate**: PASS. Quickstart includes lint/build plus unit/integration
  test execution sequence.
- **UI system gate**: PASS. Design requires Tailwind/shadcn-compatible reuse and
  extracted shared scorecard components.
- **UX and accessibility gate**: PASS. Contracts and quickstart include loading,
  empty, error, and accessible interaction expectations.
