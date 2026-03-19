# Implementation Plan: Data Entry Filters and Context

**Branch**: `001-data-entry-filters` | **Date**: 2026-03-19 | **Spec**:
`specs/001-data-entry-filters/spec.md`  
**Input**: Feature specification from `/specs/001-data-entry-filters/spec.md`

## Summary

Deliver a stateful data-entry filter experience that persists report type,
report period, category, subcategory, and service area selections in cookies;
applies cascading filter logic; and supports conditional views for Operational
category and Generation subcategory. Implementation will use server-first query
composition in data-entry services, cookie-backed filter context synchronization
between server and UI selectors, and reusable filter components consistent with
the existing Tailwind and shadcn-style UI patterns.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App
Router  
**Primary Dependencies**: Next.js, React, Drizzle ORM, pg, better-auth, Tailwind
CSS 4, shadcn component primitives  
**Storage**: PostgreSQL via Drizzle schema modules in `db/schema/*`  
**Testing**: Vitest for unit and integration behavior checks, plus
`npm run lint` and `npm run build` validation gates  
**Target Platform**: Web application (server-rendered and client-interactive
pages) on modern desktop browsers used by PRISM users  
**Project Type**: Monolithic Next.js web application with App Router and server
actions/API routes  
**Performance Goals**: Filter changes should refresh visible data-entry rows
within 2 seconds for at least 95% of normal interactions  
**Constraints**: Maintain role-based access restrictions, preserve deterministic
reporting filters, avoid schema-breaking changes, and keep selectors
keyboard/screen-reader accessible  
**Scale/Scope**: Data-entry flow for authenticated utility users across report
periods, managed-list categories/subcategories, service areas, and energy
resources (generators)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Research Gate Review

- **Type safety and architecture gate**: PASS. Plan keeps filtering and
  authorization-relevant logic in server-side services under
  `app/data-entry/**/service.ts`, with typed DTOs and UI components focused on
  rendering and interaction.
- **Security gate**: PASS. Existing auth context (`getCurrentUser`) remains the
  authority for scoped data retrieval; cookie values are treated as untrusted
  inputs and validated against authorized option sets.
- **Data integrity gate**: PASS. No new write-paths to data-entry values are
  introduced in this feature scope. This feature primarily affects read
  filtering and cookie state. No Drizzle schema update is required; if schema
  expansion is introduced later, it must flow through `db/schema/*` +
  `npm run db-push`.
- **Quality gate**: PASS with action. Required validation commands are
  `npm run lint` and `npm run build`. Behavior-changing work requires automated
  checks for filter cascade rules and conditional rendering logic.
- **UI system gate**: PASS. Selectors and grouped sections will use existing
  shared UI primitives in `components/ui/*` and extract reusable filter controls
  where repeated.
- **UX and accessibility gate**: PASS with action. Plan includes loading, empty,
  and error states for async filter options and data rows, plus labeled and
  keyboard-accessible selectors.

### Post-Design Gate Review

- **Type safety and architecture gate**: PASS. `data-model.md` defines typed
  filter-context and display-view models; `contracts/data-entry-filters.md`
  keeps server/client boundaries explicit.
- **Security gate**: PASS. Contract requires authorization-scoped option
  retrieval and invalid-cookie sanitization.
- **Data integrity gate**: PASS. Design confirms read/filter behavior only, with
  no mutation contract added.
- **Quality gate**: PASS. `quickstart.md` includes lint/build and behavior
  verification path.
- **UI system gate**: PASS. Design centralizes reusable selector and state-reset
  patterns.
- **UX and accessibility gate**: PASS. Contract and quickstart define required
  loading/empty/error/a11y checks.

## Project Structure

### Documentation (this feature)

```text
specs/001-data-entry-filters/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── data-entry-filters.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── data-entry/
│   ├── page.tsx
│   ├── reportPeriodTable.tsx
│   ├── service.ts
│   └── enter-data/
│       ├── page.tsx
│       └── service.ts
├── api/
│   └── ...
components/
├── ui/
└── tables/
db/
├── connection.ts
└── schema/
    ├── dataEntry.ts
    ├── managedLists.ts
    ├── reportPeriods.ts
    └── utility.ts
lib/
└── user.service.ts
```

**Structure Decision**: Use the existing single Next.js App Router structure and
extend the current data-entry modules (`app/data-entry/*`) with reusable filter
components and server-side query services, without introducing new top-level
apps/packages.

## Complexity Tracking

No constitution violations identified; complexity exceptions are not required.
