# Implementation Plan: Custom KPI Review Workflow

**Branch**: `008-review-custom-kpi` | **Date**: 2026-04-10 | **Spec**:
`/specs/008-review-custom-kpi/spec.md` **Input**: Feature specification from
`/specs/008-review-custom-kpi/spec.md`

## Summary

Implement a governed custom KPI lifecycle where users submit custom KPI
requests, DEV reviewers decide approve/reject/replace, approved KPIs start in
submitter-only visibility, and any DEV reviewer can later promote them globally.
The solution uses server-first Next.js route handlers and service-layer business
logic with Drizzle-backed persistence, auditable decision history, and email
notification on final decisions.

## Technical Context

**Language/Version**: TypeScript (strict mode), React 19.2.3, Next.js 16.1.1  
**Primary Dependencies**: Next.js App Router, Drizzle ORM, pg, better-auth,
nodemailer, Tailwind CSS, shadcn-style UI primitives, zod-style validator
pattern already used in route `_lib/validators` modules  
**Storage**: PostgreSQL via Drizzle ORM (`db/schema/*.ts`, `db/config.ts`)  
**Testing**: Vitest 4 (jsdom), Testing Library, existing `test/unit` and
`test/integration` layout  
**Target Platform**: Web application (server-rendered React + API routes),
Linux-based deployment environment  
**Project Type**: Full-stack web application (single Next.js project)  
**Performance Goals**: Align with spec outcomes: pending queue visibility within
1 minute (SC-001), decision completion SLA tracking (SC-002), 99% email dispatch
trigger within 5 minutes (SC-003)  
**Constraints**: Server-side authorization for all review/override/promotion
actions, immutable audit trail for decisions, one final decision with controlled
override path, email-only notification channel, Tailwind and shadcn-compatible
UI patterns  
**Scale/Scope**: One new end-to-end request-review lifecycle touching data-entry
and review workflows; expected feature scope is one submission flow, one
reviewer queue/detail flow, one promotion action, and associated
route/service/test coverage

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Gate Review

- **Type safety and architecture gate**: PASS. Plan keeps decision logic,
  authorization, duplicate detection, override, and promotion in server services
  and API routes; client components remain presentation-only.
- **Security gate**: PASS. All mutating operations require authenticated users;
  reviewer/override/promotion require DEV role checks; SMTP secrets remain in
  environment variables.
- **Data integrity gate**: PASS. Plan includes explicit schema updates for
  request status, review decisions, replacement link, visibility scope, and
  override history with Drizzle update path (`npm run db-push` or migration
  flow).
- **Quality gate**: PASS. Required validation commands are `npm run lint`,
  `npm run build`, `npm run test:unit`, and targeted `npm run test:integration`
  for behavior changes.
- **UI system gate**: PASS. Reviewer and requester status surfaces reuse
  existing status badge and table/filter patterns with Tailwind and
  shadcn-compatible components.
- **UX and accessibility gate**: PASS. Loading/empty/error/success states,
  keyboard-operable decision actions, and readable outcome messaging are
  included in scope.

### Post-Phase 1 Design Re-Check

- **Type safety and architecture gate**: PASS. Data model and contracts keep
  write behavior in API + service layers; no architecture violations introduced.
- **Security gate**: PASS. Contracts require explicit role checks and forbid
  anonymous mutation paths.
- **Data integrity gate**: PASS. State transitions and promotion/override events
  are modeled as auditable records.
- **Quality gate**: PASS. Quickstart includes mandatory lint/build/test
  evidence.
- **UI system gate**: PASS. Reuse points are explicitly identified in design.
- **UX and accessibility gate**: PASS. Design includes explicit interaction and
  state expectations for requester and reviewer surfaces.

## Project Structure

### Documentation (this feature)

```text
specs/008-review-custom-kpi/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── custom-kpi-review.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── data-entry/
│   │   ├── custom-kpi/
│   │   │   ├── requests/route.ts
│   │   │   ├── requests/[requestId]/decision/route.ts
│   │   │   └── requests/[requestId]/promotion/route.ts
│   │   └── review-kpi/
│   └── settings/
├── data-entry/
│   ├── custom-kpi/
│   │   ├── page.tsx
│   │   └── service.ts
│   └── review-kpi/
│       └── service.ts
components/
├── data-entry/
│   ├── custom-kpi-request-form.tsx
│   ├── custom-kpi-request-status-badge.tsx
│   └── custom-kpi-review-actions.tsx
db/
├── schema/
│   └── custom-kpi-requests.ts
└── migrations/
lib/
├── email.service.ts
└── user.service.ts
test/
├── unit/
│   ├── custom-kpi/
│   └── review/
└── integration/
    └── api/custom-kpi/
```

**Structure Decision**: Use the existing single Next.js project layout and
extend the current `app/api` + service pattern. Keep route handlers thin and
implement lifecycle rules in `app/data-entry/*/service.ts` modules.

## Complexity Tracking

No constitution violations requiring justification at planning time.
