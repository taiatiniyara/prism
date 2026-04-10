# Data Model: Custom KPI Review Workflow

## Entities

## 1) CustomKpiRequest

- Purpose: Represents a user-submitted custom KPI request awaiting governance.
- Primary Key: `id` (UUID)
- Fields:
  - `id`: UUID, immutable
  - `submitterUserId`: string/UUID, required, FK -> user
  - `title`: string, required, trimmed, max length bounded
  - `description`: string, optional
  - `formulaExpression`: string, required
  - `businessContext`: string, required
  - `status`: enum, required
    - `PENDING_REVIEW`
    - `APPROVED`
    - `REJECTED`
    - `REPLACED`
  - `visibilityScope`: enum, required after approval
    - `SUBMITTER_ONLY`
    - `GLOBAL`
  - `replacementKpiId`: string/UUID, nullable, FK -> existing KPI catalog
  - `createdAt`: timestamp, required
  - `updatedAt`: timestamp, required

- Validation Rules:
  - Duplicate pending submissions by same submitter and same normalized KPI
    definition are rejected.
  - `replacementKpiId` must be present when `status = REPLACED`.
  - `visibilityScope` must be `SUBMITTER_ONLY` on initial approval.

## 2) CustomKpiDecision

- Purpose: Captures reviewer decision metadata for a request.
- Primary Key: `id` (UUID)
- Fields:
  - `id`: UUID, immutable
  - `requestId`: UUID, required, FK -> CustomKpiRequest
  - `reviewerUserId`: string/UUID, required, FK -> user
  - `decisionType`: enum, required
    - `APPROVE`
    - `REJECT`
    - `REPLACE`
  - `rationale`: string, required
  - `overrideOfDecisionId`: UUID, nullable, FK -> prior CustomKpiDecision
  - `createdAt`: timestamp, required

- Validation Rules:
  - Initial decision allowed only when request is `PENDING_REVIEW`.
  - Override requires reviewer with DEV reviewer role.
  - Override must reference an existing decision.

## 3) CustomKpiLifecycleEvent

- Purpose: Immutable audit/event timeline for request actions.
- Primary Key: `id` (UUID)
- Fields:
  - `id`: UUID
  - `requestId`: UUID, required, FK -> CustomKpiRequest
  - `eventType`: enum, required
    - `REQUEST_SUBMITTED`
    - `DECISION_APPROVED`
    - `DECISION_REJECTED`
    - `DECISION_REPLACED`
    - `DECISION_OVERRIDDEN`
    - `VISIBILITY_PROMOTED`
    - `EMAIL_DISPATCHED`
    - `EMAIL_DISPATCH_FAILED`
  - `actorUserId`: string/UUID, nullable for system-generated events
  - `metadataJson`: JSON, optional
  - `createdAt`: timestamp, required

- Validation Rules:
  - Events are append-only; updates/deletes are disallowed.

## 4) CustomKpiEmailDelivery

- Purpose: Tracks email notification attempts and status independent of review
  correctness.
- Primary Key: `id` (UUID)
- Fields:
  - `id`: UUID
  - `requestId`: UUID, required, FK -> CustomKpiRequest
  - `decisionId`: UUID, required, FK -> CustomKpiDecision
  - `recipientEmail`: string, required
  - `deliveryStatus`: enum, required
    - `PENDING`
    - `SENT`
    - `FAILED_RETRYABLE`
    - `FAILED_FINAL`
  - `attemptCount`: integer, required, default 0
  - `lastError`: string, nullable
  - `nextAttemptAt`: timestamp, nullable
  - `sentAt`: timestamp, nullable
  - `createdAt`: timestamp, required
  - `updatedAt`: timestamp, required

- Validation Rules:
  - `attemptCount` increments monotonically.
  - `SENT` requires `sentAt`.
  - `FAILED_FINAL` requires `lastError`.

## Relationships

- One `CustomKpiRequest` to many `CustomKpiDecision` records (including
  overrides).
- One `CustomKpiRequest` to many `CustomKpiLifecycleEvent` records.
- One `CustomKpiDecision` to many `CustomKpiEmailDelivery` attempts (retry
  model).
- Optional many requests can reference one existing KPI through
  `replacementKpiId`.

## State Transitions

## Request Status Lifecycle

- Initial: `PENDING_REVIEW`
- Decision transitions:
  - `PENDING_REVIEW -> APPROVED` (sets `visibilityScope = SUBMITTER_ONLY`)
  - `PENDING_REVIEW -> REJECTED`
  - `PENDING_REVIEW -> REPLACED` (requires `replacementKpiId`)
- Override transitions:
  - Any terminal state can transition to a different terminal state only through
    DEV reviewer override action with audit event and reference to prior
    decision.

## Visibility Scope Lifecycle

- On approval: `SUBMITTER_ONLY`
- On promotion action (DEV reviewer): `SUBMITTER_ONLY -> GLOBAL`
- Promotion is one-way for this feature scope.
