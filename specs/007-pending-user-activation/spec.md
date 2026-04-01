# Feature Specification: Pending User Activation Gate

**Feature Branch**: `007-pending-user-activation`  
**Created**: 2026-04-02  
**Status**: Draft  
**Input**: User description: "Users who register should remain pending until
approved by BMO/DEV users, be blocked by a full-screen banner until activated,
and BMO/DEV users need an intuitive pending-user activation UI."

## Clarifications

### Session 2026-04-02

- Q: Which pending-user identity details must be shown in the activation UI? ->
  A: Full name, email, registration date, organization, dataset_required, and
  data access reason.
- Q: Which status values should define activation flow? -> A: Use existing
  schema statuses `pending` -> `active`.
- Q: Should admin workflow include reject path, and if so require reason? -> A:
  Include both activate and reject actions, with mandatory rejection reason.
- Q: How should `deactivated` users be handled at sign-in? -> A: Allow login but
  show a dedicated full-screen blocked message.
- Q: Who should see the rejection reason? -> A: Both admins and deactivated
  users.

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Block Pending User Access (Priority: P1)

As a newly registered user whose status is pending, I can sign in but cannot
access application content until my account is activated.

**Why this priority**: This enforces core access control and prevents unapproved
users from entering protected workflows.

**Independent Test**: Create a user in pending status, sign in, and verify only
the blocking activation message is visible and no app functionality is usable.

**Acceptance Scenarios**:

1. **Given** a registered user with status `pending`, **When** the user signs
   in, **Then** a blocking full-screen message is shown and all underlying app
   interactions are inaccessible.
2. **Given** a registered user with status `pending`, **When** the user attempts
   direct navigation to any in-app route, **Then** the same blocking message is
   shown.
3. **Given** a registered user with status `active`, **When** the user signs in,
   **Then** the user can access the app normally and no activation-blocking
   message is shown.
4. **Given** a registered user with status `deactivated`, **When** the user
   signs in, **Then** a dedicated full-screen deactivated message is shown and
   all underlying app interactions are inaccessible.

---

### User Story 2 - Decide Pending Users (Priority: P2)

As a BMO or DEV user, I can view pending registrations and activate selected
users through a clear, intuitive workflow.

**Why this priority**: Administrative decisioning is required to complete
onboarding outcomes and maintain controlled access.

**Independent Test**: Sign in as BMO/DEV, open pending-user view, activate one
pending user and reject another with reason, then verify status updates and
feedback.

**Acceptance Scenarios**:

1. **Given** a BMO/DEV user and at least one pending account, **When** the
   BMO/DEV user opens the pending-user interface, **Then** pending users are
   clearly listed with key identifying details and an activation action.
2. **Given** a BMO/DEV user viewing a pending account, **When** the user
   confirms activation, **Then** the account status changes from `pending` to
   `active` and the list reflects the update.
3. **Given** a BMO/DEV user viewing a pending account, **When** the user
   confirms rejection and provides a rejection reason, **Then** the account
   status changes from `pending` to `deactivated`, the reason is saved, and the
   list reflects the update.
4. **Given** a non-BMO/DEV user, **When** that user attempts to access
   pending-user activation features, **Then** activation controls are not
   available.

---

### User Story 3 - Understand Access Status (Priority: P3)

As a blocked user (`pending` or `deactivated`), I can clearly understand why
access is blocked and what must happen next.

**Why this priority**: Clear messaging reduces confusion and avoids unnecessary
support requests.

**Independent Test**: Sign in as both pending and deactivated users and verify
the message clearly explains each status and access limitation.

**Acceptance Scenarios**:

1. **Given** a pending user on the blocking screen, **When** the screen is
   displayed, **Then** the message explains that registration is pending
   approval and app access is unavailable until activation.
2. **Given** a pending user on the blocking screen, **When** the user refreshes
   or starts a new session while still pending, **Then** the same blocking state
   persists.
3. **Given** a deactivated user on the blocking screen, **When** the screen is
   displayed, **Then** the message explains access is denied and provides clear
   next-step guidance.

---

### Edge Cases

- A user is activated by BMO/DEV while the user is currently signed in and
  blocked; on next session validation or refresh, the user is allowed into the
  app.
- Activation is attempted for an account that is already activated; no duplicate
  transition occurs and the admin receives clear feedback.
- Rejection is attempted without entering a reason; the action is blocked and
  the admin is prompted to provide a reason.
- A deactivated user signs in; the user is authenticated but remains blocked by
  a deactivated-specific message.
- Multiple BMO/DEV users attempt to activate the same pending account at nearly
  the same time; the final state remains consistent and only one successful
  transition is recorded.
- No pending users exist; the pending-user interface shows an explicit empty
  state.
- The pending-user message must remain readable and accessible across desktop
  and mobile viewport sizes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST assign newly registered users an initial status of
  `pending`.
- **FR-002**: System MUST allow users with `pending` status to authenticate
  successfully.
- **FR-003**: System MUST block users with `pending` status from accessing
  application functionality after authentication.
- **FR-003a**: System MUST also block users with `deactivated` status from
  accessing application functionality after authentication.
- **FR-004**: System MUST display a blocking full-screen status message to
  pending users indicating access is restricted until activation.
- **FR-005**: The blocking message MUST explicitly state that a BMO or DEV user
  must activate the registration before access is granted.
- **FR-005a**: Users in `deactivated` status MUST see a dedicated full-screen
  message distinct from the pending message.
- **FR-005b**: The deactivated full-screen message MUST include the stored
  rejection reason.
- **FR-006**: System MUST provide BMO and DEV users a dedicated interface to
  view all users in `pending` status.
- **FR-007**: The pending-user interface MUST present the identity fields
  defined in FR-007a and FR-007b so BMO/DEV users can confidently decide
  activation or rejection.
- **FR-007a**: The pending-user interface MUST display full name, email,
  registration date, and organization for each pending user.
- **FR-007b**: The pending-user interface MUST also display `dataset_required`
  and `data_access_reason` values for each pending user.
- **FR-008**: BMO and DEV users MUST be able to activate a pending user from the
  interface.
- **FR-008a**: BMO and DEV users MUST be able to reject a pending user from the
  interface.
- **FR-008b**: Rejecting a pending user MUST require a non-empty rejection
  reason.
- **FR-009**: When activation is completed, system MUST transition the user
  status from `pending` to `active` and persist that change.
- **FR-009a**: When rejection is completed, system MUST transition the user
  status from `pending` to `deactivated`, persist that change, and persist the
  rejection reason.
- **FR-009b**: The persisted rejection reason MUST be viewable by BMO/DEV users
  in administrative UI and by the affected deactivated user in their blocked
  message view.
- **FR-010**: Non-BMO/DEV users MUST NOT be able to view or execute pending-user
  activation actions.
- **FR-011**: Once a user becomes `active`, the user MUST be able to access
  application content on the next access check without seeing the blocking
  message.
- **FR-012**: System MUST provide clear success and failure feedback to BMO/DEV
  users for activation attempts.
- **FR-013**: Blocked-status access policy is the combined enforcement of FR-003
  and FR-003a: users in `pending` and `deactivated` can authenticate but are
  prevented from using app functionality.

### Constitution Alignment Requirements _(mandatory)_

- **CA-001 Security**: Authentication remains available to pending users, but
  authorization MUST enforce status-based gating for all protected app access.
  Activation actions MUST be restricted to BMO/DEV roles, while deactivated
  users can view only their own rejection reason.
- **CA-002 Data Integrity**: User status transitions are limited to valid states
  (`pending` to `active`, `pending` to `deactivated`) with auditable updates to
  avoid inconsistent account lifecycle data.
- **CA-003 Validation**: Delivery evidence MUST include passing lint, build, and
  automated test checks covering pending-user blocking and BMO/DEV activation
  flows.
- **CA-004 UX Accessibility**: Blocking banner and pending-user admin UI MUST
  include accessible messaging, keyboard operability, and explicit
  loading/empty/error states.
- **CA-005 UI Standards**: Any new or changed UI surfaces MUST follow existing
  project UI component conventions and styling standards.
- **CA-006 Reuse**: Shared status messaging, role checks, and user-status
  transition rules MUST be implemented as reusable patterns to avoid
  duplication.

### Key Entities _(include if feature involves data)_

- **User Account**: Represents a registered person with identity attributes and
  an account status lifecycle (`pending`, `active`, `deactivated`).
- **Activation Permission Role**: Represents authorization grouping for
  administrative users (`BMO`, `DEV`) who can view pending users and trigger
  activation.
- **Activation Event**: Represents a status change action containing actor,
  target user, prior status, new status, timestamp, outcome, and rejection
  reason when applicable.

## Assumptions

- Existing authentication remains unchanged; this feature adds status-based
  post-login access control.
- `active` is the status that grants full app access.
- BMO and DEV are existing roles already recognized by the authorization model.
- Pending and deactivated users can continue to sign in so they can see their
  current status and instructions.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of sign-ins by users in `pending` status are blocked from
  protected app content.
- **SC-002**: 100% of users activated by BMO/DEV gain normal app access on their
  next access check.
- **SC-003**: At least 95% of pending users report that the blocking message
  clearly explains why access is unavailable and what must happen next.
- **SC-003a**: At least 95% of deactivated users report that the dedicated
  deactivated message clearly explains denied access, shows the rejection
  reason, and provides next-step guidance.
- **SC-004**: BMO/DEV users can locate and activate a pending user in under 60
  seconds for at least 90% of activation attempts during UAT.
- **SC-005**: Support requests related to "cannot access app after registration"
  decrease by at least 40% within one release cycle after rollout.
