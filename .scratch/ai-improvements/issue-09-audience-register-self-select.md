# Audience Register Self-Select UI

## What to build

EXT (external) users can self-identify their stakeholder type via the `stakeholder_type` request field (`government`, `donor`, `consultant`, `researcher`), but there is no UI to select it. The field is only settable via API. Additionally, the audience register is set once at conversation start and cannot be changed mid-conversation.

Add a dropdown selector in the chat UI for EXT users, persist the selection per session, show an active register indicator, and support mid-conversation switching.

## Acceptance criteria

- [ ] EXT users see a "Speaking as:" dropdown in the chat header with options: Consultant (default), Government / Regulator, Donor / DFI, Education / Researcher
- [ ] Selection is sent as `stakeholder_type` with each request
- [ ] Active register is displayed as a badge/chip: e.g., "Government / Regulator"
- [ ] Changing the register mid-conversation updates the badge and sends the new value on the next request
- [ ] Selection persists per session (stored in session state, not per-turn)
- [ ] Non-EXT users do not see the selector (their register is role-derived)
- [ ] The server's `getAudienceRegister()` function reads the persisted stakeholder_type from the session

## Blocked by

None — can start immediately.
