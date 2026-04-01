# Implementation Plan: Pending User Activation Gate

**Branch**: `007-pending-user-activation` | **Date**: 2026-04-02 | **Spec**:
`C:\Users\codec\OneDrive\Documents\PRISM\prism\specs\007-pending-user-activation\spec.md`
**Input**: Feature specification from
`C:\Users\codec\OneDrive\Documents\PRISM\prism\specs\007-pending-user-activation\spec.md`

## Summary

Implement status-aware post-login access control and admin decisioning for user
onboarding. Users with `pending` and `deactivated` statuses can authenticate but
are blocked from app functionality. BMO/DEV users get a dedicated pending-users
workflow to activate (`pending` -> `active`) or reject (`pending` ->
`deactivated`) with mandatory rejection reason. The approach reuses existing
auth/session patterns (`getSession`, `getCurrentUser`), existing user settings
capabilities, and Drizzle schema extensions for rejection/audit fields.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19.2.3, Next.js 16.1.1 (App
Router)  
**Primary Dependencies**: better-auth, drizzle-orm, pg, Next.js server
actions/routes, Tailwind CSS, shadcn-style UI components  
**Storage**: PostgreSQL via Drizzle ORM schema in `db/schema`  
**Testing**: Vitest (`npm run test`, `npm run test:unit`,
`npm run test:integration`) + existing Testing Library setup  
**Target Platform**: Web application deployed on Node runtime (Next.js server)  
**Project Type**: Full-stack web application (App Router, server routes/actions,
component UI)  
**Performance Goals**: Access gating and admin status transitions should
complete within existing settings page interaction expectations (no perceptible
UI lag during single-user decision actions)  
**Constraints**: Must preserve server-first authorization checks; must keep
status values aligned to existing schema (`pending`, `active`, `deactivated`);
rejection reason required for reject path; no bypass of protected app routes  
**Scale/Scope**: Organization-admin workflow over user table; expected
low-frequency administrative mutations and moderate read/list traffic

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Type safety and architecture gate**: PASS. Status gating and decision
  transitions will be implemented on server paths (session
  retrieval/services/routes) with strict typed status unions and minimal
  client-side decision logic.
- **Security gate**: PASS. Authentication remains via better-auth; authorization
  for decision actions constrained to BMO/DEV roles. Deactivated users can only
  see their own rejection reason in blocked state.
- **Data integrity gate**: PASS. Status transitions restricted to allowed edges
  (`pending` -> `active`, `pending` -> `deactivated`); Drizzle schema update
  path via `npm run db-push`; idempotent handling for repeated decisions.
- **Quality gate**: PASS. Validation commands: `npm run lint`, `npm run build`,
  `npm run test:integration` (plus focused new tests for gating and decision
  flow).
- **UI system gate**: PASS. New blocked-state and pending-user admin
  interactions use existing Tailwind/shadcn component patterns; repeated status
  message components will be extracted for reuse.
- **UX and accessibility gate**: PASS. Plan includes explicit
  loading/empty/error states in pending-user list and keyboard/screen-reader
  friendly decision controls and blocked overlays.

### Post-Design Constitution Check

- **Type safety and architecture gate**: PASS. Data model and contracts keep
  status mutation server-owned and typed.
- **Security gate**: PASS. Contracts define role checks for admin decisions and
  scoped visibility for rejection reason.
- **Data integrity gate**: PASS. Data model includes transition rules, reason
  persistence, and auditable event records.
- **Quality gate**: PASS. Quickstart defines lint/build/tests for behavior
  changes.
- **UI system gate**: PASS. Design specifies reuse points for blocked-state and
  decision action affordances.
- **UX and accessibility gate**: PASS. Design includes loading/empty/error and
  accessible interaction expectations.

## Project Structure

### Documentation (this feature)

```text
specs/007-pending-user-activation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── pending-user-admin.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── auth/
├── settings/
│   └── users/
├── api/
│   ├── auth/
│   └── ...
└── layout.tsx

components/
├── layout/
├── tables/
└── ui/

db/
├── connection.ts
└── schema/
   └── auth-schema.ts

lib/
├── auth.ts
├── session.service.ts
└── user.service.ts

test/
├── integration/
└── unit/
```

**Structure Decision**: Use the existing single Next.js App Router project
structure. Implement server-side decision and gating logic in `app/`, `lib/`,
and `db/` layers, with UI changes in `app/settings/users` and shared components.
Add integration/unit tests under `test/`.

## Phase 0 Output

Research decisions are documented in
`C:\Users\codec\OneDrive\Documents\PRISM\prism\specs\007-pending-user-activation\research.md`.

## Phase 1 Output

- Data model:
  `C:\Users\codec\OneDrive\Documents\PRISM\prism\specs\007-pending-user-activation\data-model.md`
- Contracts:
  `C:\Users\codec\OneDrive\Documents\PRISM\prism\specs\007-pending-user-activation\contracts\pending-user-admin.openapi.yaml`
- Quickstart:
  `C:\Users\codec\OneDrive\Documents\PRISM\prism\specs\007-pending-user-activation\quickstart.md`

## Complexity Tracking

No constitution violations requiring exceptions.
