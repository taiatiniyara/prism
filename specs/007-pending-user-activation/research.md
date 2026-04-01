# Phase 0 Research: Pending User Activation Gate

## Decision 1: Enforce blocking after authentication at session-aware app entry points

- Decision: Keep authentication enabled for all statuses, then apply status
  gating (`pending`, `deactivated`) at server-side access checks used by
  protected routes/pages.
- Rationale: Aligns with requirement that blocked users can still log in and see
  status messaging while preventing access to business functionality.
- Alternatives considered:
  - Block sign-in for non-active users: rejected because spec requires sign-in
    to succeed.
  - Client-only guard in page components: rejected due to security and bypass
    risk.

## Decision 2: Reuse existing user settings/admin surface for pending-user decision UI

- Decision: Implement pending-user decision workflow in existing settings users
  surface (`app/settings/users`) with dedicated filters/actions for BMO/DEV
  users.
- Rationale: Existing user management flow already joins user/role/organization
  and is role-aware; reusing it reduces duplicate admin UI.
- Alternatives considered:
  - New standalone admin module: rejected as unnecessary scope growth.
  - SQL/admin-only operation without UI: rejected because intuitive UI is
    required.

## Decision 3: Keep status vocabulary aligned to current schema

- Decision: Use only current status values: `pending`, `active`, `deactivated`.
- Rationale: Avoids data migration risk and prevents mismatch between spec and
  implementation.
- Alternatives considered:
  - Add `activated` status: rejected due to migration complexity and redundant
    semantics.

## Decision 4: Model reject flow as `pending` -> `deactivated` with required reason

- Decision: Reject action requires non-empty reason and persists reason with
  state transition.
- Rationale: Meets business requirement and preserves traceability of admin
  decisions.
- Alternatives considered:
  - Reject without reason: rejected due to explicit requirement.
  - Hard delete pending users: rejected due to audit and user communication
    needs.

## Decision 5: Display rejection reason to both admins and affected deactivated user

- Decision: Persist rejection reason and expose it in admin UI and deactivated
  blocked screen for that same user.
- Rationale: Matches clarified requirement while keeping visibility scoped to
  authorized actor and affected subject.
- Alternatives considered:
  - Admin-only reason visibility: rejected by clarification.
  - Public reason visibility to all users: rejected for privacy/security
    concerns.

## Decision 6: Add auditable status-change event record

- Decision: Record each activation/rejection with actor, target user,
  from-status, to-status, timestamp, and reason (when present).
- Rationale: Supports constitution data-integrity principle and
  conflict/incident diagnostics.
- Alternatives considered:
  - Rely only on current user row state: rejected due to limited auditability.
  - External logging only: rejected because relational queryability is needed
    for admin diagnostics.

## Decision 7: Protect decision actions with server-side role checks and idempotency

- Decision: Decision mutations validate role (BMO/DEV), validate current state,
  and return deterministic response if already transitioned.
- Rationale: Prevents privilege misuse and race-condition inconsistencies.
- Alternatives considered:
  - UI-hidden buttons only: rejected because server authorization is mandatory.
  - Blind update regardless of prior state: rejected due to data-integrity risk.

## Decision 8: Validation strategy for behavior-changing access control

- Decision: Validate with lint/build and targeted integration tests for blocked
  access, role restrictions, and decision transitions.
- Rationale: Existing repository already uses Vitest integration coverage for
  route/auth behavior.
- Alternatives considered:
  - Unit tests only: rejected because authorization and session flow are
    cross-layer behaviors.
  - Manual QA only: rejected as insufficient for regression prevention.
