# Implementation Plan: AI Reporting Assistant for PRISM

**Branch**: `009-ai-reporting-assistant` | **Date**: 2026-04-16 | **Spec**:
`/specs/009-ai-reporting-assistant/spec.md` **Input**: Feature specification
from `/specs/009-ai-reporting-assistant/spec.md`

## Summary

Deliver a server-first AI reporting capability where DEV, BMO, BLO, and CEO
users can ask natural-language questions and receive role-scoped summaries,
metrics, and supporting tables, with mandatory PDF/CSV export support, 90-day
execution logging, and human-review gating before external sharing of narrative
reports. Phase one routes intent to existing read-only service functions only,
with explicit guardrails and no unrestricted SQL execution.

## Technical Context

**Language/Version**: TypeScript (strict mode), React 19, Next.js 16 App
Router  
**Primary Dependencies**: Next.js route handlers, Drizzle ORM, pg,
better-auth/session services, Tailwind CSS, shadcn-compatible UI, existing PRISM
domain services, Vercel AI SDK (`ai`) with OpenAI provider  
**AI Model Strategy**: GPT-5 (primary), GPT-5-mini (fallback)  
**Storage**: PostgreSQL (existing PRISM database) plus new AI execution trace
table(s) via Drizzle schema update path  
**Testing**: Vitest (unit/integration), route/service tests, existing lint/build
commands  
**Target Platform**: Web application deployment on Linux-based server runtime
for Next.js  
**Project Type**: Full-stack single Next.js web application  
**Performance Goals**: Meet spec outcomes: common pilot queries return within 30
seconds for first-pass answers; maintain at least 95% query completion within 20
seconds (p95 <= 20s) under normal load  
**Constraints**: Read-only AI data path; no unrestricted model-generated SQL;
role-scoped access enforcement on every tool call; 90-day log retention;
human-review gate before external narrative sharing; mandatory PDF/CSV export in
MVP  
**Scale/Scope**: Initial rollout to DEV/BMO/BLO/CEO roles, core query classes
(completeness, bottlenecks, stale/missing KPI, pending queues), and audit review
support

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Gate Review

- **Type safety and architecture gate**: PASS. AI orchestration and intent
  routing stay server-side in API/service layers; client remains presentation
  focused.
- **Security gate**: PASS. Existing authentication and role checks are reused;
  allowed launch roles are explicit; prompt inputs and filter context validation
  remain mandatory.
- **Data integrity gate**: PASS. MVP is read-only for business data; only trace
  logging/policy state additions require Drizzle schema update path.
- **Quality gate**: PASS. Delivery requires `npm run lint`, `npm run build`, and
  automated tests for authorization, guardrails, and response contracts.
- **UI system gate**: PASS. AI UI results and status surfaces will use existing
  Tailwind + shadcn-compatible patterns and reusable components.
- **UX and accessibility gate**: PASS. Loading/empty/error/success states and
  keyboard/screen-reader support are explicitly required.

### Post-Phase 1 Design Re-Check

- **Type safety and architecture gate**: PASS. Contracts and data model keep
  decision logic in server routes/services and presentational rendering in UI.
- **Security gate**: PASS. Contracted interfaces require authenticated access,
  role checks, and tool-level authorization per request.
- **Data integrity gate**: PASS. AI trace retention and review-gating records
  are modeled as auditable entities with controlled lifecycle.
- **Quality gate**: PASS. Quickstart includes lint/build/test validation steps.
- **UI system gate**: PASS. Reuse points identified for response rendering and
  status cards.
- **UX and accessibility gate**: PASS. Interaction states and assistive
  messaging requirements preserved in quickstart and contracts.

## Project Structure

### Documentation (this feature)

```text
specs/009-ai-reporting-assistant/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ai-reporting.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── api/
│   └── ai/
│       ├── query/route.ts
│       ├── exports/route.ts
│       ├── reports/[reportId]/share/route.ts
│       └── traces/route.ts
├── dashboard/
│   └── ai-assistant/


components/
├── ai/
│   ├── assistant-panel.tsx
│   ├── response-summary.tsx
│   ├── response-metrics-table.tsx
│   ├── response-source-attribution.tsx
│   └── export-actions.tsx

db/
├── schema/
│   └── ai-reporting.ts
└── migrations/

lib/
├── ai/
│   ├── intent-router.ts
│   ├── allowed-read-services.ts
│   ├── response-contract.ts
│   ├── export.service.ts
│   └── trace-log.service.ts

test/
├── integration/
│   ├── api/ai/
│   └── ai/
└── unit/
    └── ai/
```

**Structure Decision**: Extend the current single Next.js project using the
existing API + service layering pattern. Add an `app/api/ai` surface, shared AI
domain services under `lib/ai`, reusable presentation components under
`components/ai`, and validation coverage in existing `test/unit` and
`test/integration` directories.

## Complexity Tracking

No constitution violations requiring additional justification.
