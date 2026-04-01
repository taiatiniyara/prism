# Data Model: Pending User Activation Gate

## Entity: UserAccount

- Source: `db/schema/auth-schema.ts` (`user` table)
- Purpose: Represents authenticated user identity and access lifecycle.

### Fields used by this feature

- `id: string` (PK)
- `name: string`
- `email: string` (unique)
- `organisation_id: number | null`
- `role_id: number | null`
- `status: "pending" | "active" | "deactivated"`
- `dataset_required: string | null`
- `data_access_reason: string | null`
- `date_approved: timestamp | null`
- `updatedAt: timestamp`

### New/extended fields for this feature

- `reject_reason: string | null` (new; required when status is transitioned to
  `deactivated` through reject flow)
- `date_rejected: timestamp | null` (new)
- `rejected_by_user_id: string | null` (new; actor reference for reject action)

### Validation rules

- New registrations default to `status = "pending"`.
- `pending` users can authenticate but are denied protected app functionality.
- `deactivated` users can authenticate but are denied protected app
  functionality.
- Transition to `deactivated` requires non-empty `reject_reason`.
- Transition to `active` clears any stale rejection fields (if present from
  prior rejected state workflows).

## Entity: StatusDecisionEvent

- Purpose: Immutable audit record for status transitions initiated by admin
  users.
- Storage: `user_status_event` table in `db/schema/auth-schema.ts`.

### Fields

- `id: serial` (PK)
- `target_user_id: string` (FK -> `user.id`)
- `actor_user_id: string` (FK -> `user.id`)
- `from_status: "pending" | "active" | "deactivated"`
- `to_status: "pending" | "active" | "deactivated"`
- `decision_type: "activate" | "reject"`
- `reason: string | null`
- `created_at: timestamp`

### Validation rules

- `decision_type = "reject"` requires non-empty `reason`.
- `from_status` and `to_status` must differ.
- Only valid decision transitions in this feature:
  - `pending -> active`
  - `pending -> deactivated`

## Entity: PendingUserListItem (View Model)

- Purpose: Admin-facing row model for pending-user decision UI.

### Fields

- `id`
- `name`
- `email`
- `organisation` (derived from join)
- `createdAt` (registration date)
- `dataset_required`
- `data_access_reason`
- `status` (must be `pending` in this list)
- `decisionState` (client-local: idle/loading/success/error)

## Entity: BlockedAccessState (View Model)

- Purpose: Render full-screen blocking state for non-active users.

### Fields

- `status: "pending" | "deactivated"`
- `headline`
- `body`
- `rejectionReason?: string` (required for deactivated view)
- `nextSteps`

## Relationships

- `UserAccount.role_id -> roles.id`
- `UserAccount.organisation_id -> organisations.id`
- `StatusDecisionEvent.target_user_id -> user.id`
- `StatusDecisionEvent.actor_user_id -> user.id`

## Contract Alignment Notes

- `GET /api/settings/users/pending` returns `PendingUser[]` with `id`, `name`,
  `email`, `organisation`, `registrationDate`, `datasetRequired`,
  `dataAccessReason`, and `status`.
- `POST /api/settings/users/{userId}/status` accepts `decision` (`activate` or
  `reject`) and optional/required `rejectionReason` based on decision type.
- Response includes `userId`, `fromStatus`, `toStatus`, `applied`,
  `rejectionReason`, `decidedAt`, and `decidedBy`.

## State Transitions

- Initial state: `pending`
- Activation flow: `pending -> active`
  - Preconditions: actor role in {`BMO`, `DEV`}
  - Side effects: set `date_approved`, clear rejection metadata, append
    `StatusDecisionEvent`
- Rejection flow: `pending -> deactivated`
  - Preconditions: actor role in {`BMO`, `DEV`}, non-empty reason
  - Side effects: set rejection fields, append `StatusDecisionEvent`
- Access gate behavior:
  - `active`: full app access
  - `pending`: blocked overlay with pending message
  - `deactivated`: blocked overlay with deactivated message + rejection reason
