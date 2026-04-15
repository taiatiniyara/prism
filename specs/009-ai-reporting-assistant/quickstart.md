# Quickstart: AI Reporting Assistant for PRISM

## Purpose

Implement and validate the AI Reporting Assistant MVP for role-scoped
natural-language reporting with mandatory PDF/CSV export and human-review gating
for external narrative sharing.

## Prerequisites

- Node.js and npm versions aligned with repository baseline.
- Valid environment configuration for existing PRISM auth and data services.
- Feature branch checked out: 009-ai-reporting-assistant.

## Implementation Steps

1. Add AI API routes under app/api/ai for query, export, and share-review
   actions.
2. Implement intent routing to existing read-only service functions only.
3. Add centralized guardrails for timeout, row limit, forbidden operations, and
   safe error shaping.
4. Implement typed response envelope with summary, metrics, rows, attribution,
   and export fields.
5. Add export generation flow for both PDF and CSV in MVP.
6. Add execution trace persistence and 90-day retention metadata.
7. Implement human-review approval workflow before external narrative sharing.
8. Add UI surfaces/components for query input, response rendering, source
   attribution, export actions, and review state messaging.

## Validation Checklist

1. Run lint and confirm success:
   - npm run lint
2. Run build and confirm success:
   - npm run build
3. Run automated tests covering behavior changes:
   - npm run test:unit
   - npm run test:integration

## Scenario Validation

1. Authorized role query success:
   - DEV/BMO/BLO/CEO receives scoped summary, metrics, rows, attribution, and
     export actions.
2. Unauthorized role access:
   - Non-allowed role denied at AI endpoint and denial logged.
3. Guardrail behavior:
   - Oversized request/timeouts/forbidden prompt patterns produce safe error
     results.
4. Export behavior:
   - PDF and CSV exports both generated successfully for valid AI report output.
5. Human-review gate:
   - Narrative external sharing blocked before approval and allowed after
     approval.
6. Audit trace retention metadata:
   - Trace records include trace id, selected tools, outcome, latency, and
     retained-until timestamp aligned to 90-day policy.

## Validation Run Log (2026-04-16)

- Command: `npm run lint`
  - Result: failed (pre-existing repository lint debt outside AI feature scope).
  - Summary: 43 issues total (35 errors, 8 warnings).
  - Representative files: `app/settings/inputs/formulaBuilder.tsx`,
    `app/migration/service.ts`, `components/data-entry/scorecard-tree.tsx`.

- Command: `npm run build`
  - Result: passed.
  - Summary: Next.js production build completed successfully and includes AI
    routes/pages (`/api/ai/query`, `/api/ai/exports`,
    `/api/ai/reports/[reportId]/share`, `/api/ai/traces`,
    `/dashboard/ai-assistant`, `/settings/reporting/ai-traces`).

- Command: `npm run test:unit`
  - Result: passed after targeted non-AI test fixes.
  - Summary: 34 test files passed, 70 tests passed.
  - Coverage signal: includes AI and non-AI suites.

- Command: `npm run test:integration`
  - Result: passed after targeted non-AI test fixes.
  - Summary: 60 test files passed, 86 tests passed.
  - Coverage signal: includes AI and non-AI suites.

## Scenario Validation Outcome

- Authorized role query success: PASS (AI query success integration test).
- Unauthorized role access: PASS (forbidden role integration test).
- Guardrail behavior: PASS (policy bypass integration test).
- Export behavior: PASS (PDF/CSV exports integration test).
- Human-review gate: PASS (share-review integration test).
- Audit trace retention metadata: PASS (trace admin + retention unit tests).

## Notes for Handoff

- Keep write operations to business entities disabled for AI execution path in
  MVP.
- Reuse existing PRISM authorization and service-layer access rules; do not
  duplicate policy logic in client components.
- Preserve contract stability for downstream reporting surfaces by versioning
  response schema changes.
