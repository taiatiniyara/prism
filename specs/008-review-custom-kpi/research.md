# Phase 0 Research: Custom KPI Review Workflow

## Scope

Research consolidates implementation decisions for architecture, data integrity,
notification reliability, and governance controls required by the feature spec.
No unresolved NEEDS CLARIFICATION markers remain after this phase.

## Decisions

### 1) Decision: Keep business logic server-first in service modules behind Next.js route handlers

- Rationale: Existing repository patterns in `app/api/*/route.ts` use thin
  handlers and service calls. Keeping custom KPI lifecycle logic (duplicate
  prevention, decisioning, override, promotion) in service modules preserves
  testability and constitutional alignment.
- Alternatives considered:
  - Put logic directly in route handlers: rejected because it increases
    duplication and weakens unit-test isolation.
  - Put logic in client actions: rejected for security and integrity reasons.

### 2) Decision: Use explicit lifecycle states and immutable event history

- Rationale: Feature requires auditable decisions and controlled overrides.
  Storing lifecycle status plus append-only events supports compliance and clear
  timeline reconstruction.
- Alternatives considered:
  - Single mutable status column without event history: rejected because it
    obscures who changed what and when.
  - Soft audit via application logs only: rejected because logs are not a
    reliable source of truth for reporting-critical workflows.

### 3) Decision: Replacement remains reviewer-driven (manual selection + mandatory rationale)

- Rationale: Semantic overlap between KPIs requires domain judgment. Manual
  reviewer selection avoids false positives from naive matching.
- Alternatives considered:
  - Automatic exact matching by title/formula: rejected due to high false
    negatives/positives.
  - No replacement path: rejected because it misses the explicit governance
    need.

### 4) Decision: Approved custom KPI visibility starts as submitter-only; global promotion is explicit and reviewer-driven

- Rationale: This supports safe rollout of newly approved KPIs while preserving
  reviewer governance.
- Alternatives considered:
  - Immediate global activation: rejected due to higher blast radius.
  - Admin-only promotion: rejected based on clarified requirement that any DEV
    reviewer may promote.

### 5) Decision: Email is the required outcome channel using existing SMTP-backed mail service

- Rationale: Spec clarifies email-only notification and repository already has
  `lib/email.service.ts` using nodemailer with SMTP env vars.
- Alternatives considered:
  - In-app notifications only: rejected by clarification.
  - Combined in-app + email: deferred to future enhancement; out of current
    scope.

### 6) Decision: Email reliability policy is retry with bounded exponential backoff + operational visibility

- Rationale: Edge cases require preserving decision state on email failure.
  Decision writes must commit first, and email dispatch failures must be
  retriable without mutating final decision outcome.
- Alternatives considered:
  - Fail decision transaction when email fails: rejected because it couples
    business correctness to external SMTP availability.
  - No retry policy: rejected because it can violate notification outcome goals.

### 7) Decision: Observability baseline for this feature includes structured audit events and KPI workflow metrics

- Rationale: Deferred clarification from specify phase is resolved by defining
  minimum telemetry for production support and SLA tracking.
- Alternatives considered:
  - Logs only: rejected because SLA and reliability targets need measurable
    counters/latency.

## Best-Practice Notes by Dependency

### Next.js App Router + API Routes

- Keep route handlers focused on auth, parsing, and response shaping.
- Centralize domain rules in `service.ts` modules.
- Return deterministic error prefixes (`FORBIDDEN:`, `VALIDATION:`) aligned with
  existing pattern.

### Drizzle + PostgreSQL

- Add schema in `db/schema/*.ts` and apply via repository update path.
- Use explicit foreign keys for submitter, reviewer, and replacement references.
- Prefer enum-like constrained values for status and decision type.

### Nodemailer SMTP Integration

- Reuse existing transporter initialization in `lib/email.service.ts`.
- Surface send failures as retriable operational errors and preserve decision.
- Record delivery attempts and terminal failures for audit/support.

## Integration Patterns Chosen

- Reviewer authorization via existing user/session lookup (`getCurrentUser`) and
  role-aware service checks.
- Validation at API boundary via dedicated validators under route-local `_lib`.
- Event and audit metadata persisted transactionally with decision mutation.
- Email dispatch triggered after transaction commit, with retry worker or
  deferred retry mechanism.

## Resolved Items from Prior Deferred Clarifications

- Observability specifics: resolved with audit events + workflow metrics.
- Email retry/backoff policy: resolved with bounded exponential retry.
- Scale assumptions: scoped to single feature flow with queue visibility and
  notification SLA targets from spec success criteria.
