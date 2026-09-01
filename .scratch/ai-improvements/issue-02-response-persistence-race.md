# Fix Response Persistence Race Condition

## What to build

Two code paths persist the AI assistant's response to the `ai_chat_turn` table: the server's `onFinish` callback in the chat route, and the client-side `POST /api/ai/chat/response` fallback endpoint. Both fire after the stream ends, creating a race where the response may be double-saved, saved inconsistently, or not saved at all if one path fails silently.

Add an idempotency mechanism so the response is persisted exactly once regardless of which path completes first.

## Acceptance criteria

- [ ] Response is persisted exactly once per turn — never zero times, never twice
- [ ] If `onFinish` succeeds, the `chat/response` fallback becomes a no-op
- [ ] If `onFinish` fails, the `chat/response` fallback safely persists the response
- [ ] Idempotency key (turn ID) prevents duplicate writes at the DB level
- [ ] Test verifies concurrent persistence attempts produce exactly one row

## Blocked by

None — can start immediately.
