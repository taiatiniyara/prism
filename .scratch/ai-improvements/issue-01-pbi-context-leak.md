# Fix PBI Conversation Context Leak

## What to build

The `conversationContext` variable in the Power BI enrichment layer is declared at module scope, meaning it is shared across ALL concurrent users. When User A's conversation sets `utility = "EPC"`, User B's next Power BI query can silently inherit "EPC" as context — leaking data and producing incorrect results.

Convert the module-scoped variable to session-keyed storage so each conversation maintains its own isolated context.

## Acceptance criteria

- [ ] `conversationContext` is no longer module-scoped — it's keyed by session ID
- [ ] Two concurrent sessions from different users cannot read each other's utility/fy context
- [ ] Context is correctly set and retrieved within the same session
- [ ] Test verifies isolation: parallel calls from different session IDs produce correct, non-leaked context
- [ ] Existing PBI tool tests pass without modification to their assertions

## Blocked by

None — can start immediately.
