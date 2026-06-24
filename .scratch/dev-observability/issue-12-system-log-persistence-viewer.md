# Issue 12 — System Log Persistence + Viewer

## What to build

A system log ring buffer and viewer that captures the console output from `lib/logger.ts` and makes it browsable in the app. The logger is enhanced to also write to an in-memory ring buffer (circular array, configurable capacity defaulting to 10,000 entries). Each entry stores: timestamp, level, message, optional metadata.

An API endpoint `GET /api/logs/system?level=&search=&limit=&before=` returns entries from the ring buffer with filtering. Level filter accepts `debug`, `info`, `warn`, `error` — multiple via comma-separated. Search performs substring match on message. The `before` param (ISO timestamp) enables pagination.

A `/settings/logs/system` page renders the log stream as a virtualized list with: level color badges, timestamp, and message. A level filter bar at the top. A search input with debounce. An "Auto-scroll" toggle that follows new entries in near-real-time (polls every 2 seconds). Clicking a row expands to show the full metadata JSON.

Buffer capacity is configurable via env var `LOG_BUFFER_SIZE` (default 10000). When the buffer is full, oldest entries are dropped.

## Acceptance criteria

- [ ] `lib/logger.ts` enhanced to also push to in-memory ring buffer (module-level array with circular write pointer)
- [ ] `GET /api/logs/system?level=warn,error&search=timeout&limit=100` returns matching entries
- [ ] `before` param for cursor-based pagination through the buffer
- [ ] `/settings/logs/system` page shows log entries with level-colored badges, timestamps, messages
- [ ] Level filter tabs: All | Debug | Info | Warn | Error
- [ ] Search input filters by message substring, debounced 300ms
- [ ] Auto-scroll toggle polls every 2s for new entries, scrolls to bottom
- [ ] Expand row to see full metadata object
- [ ] "Copy" button per row copies the full JSON entry to clipboard
- [ ] Buffer size configurable via `LOG_BUFFER_SIZE` env var
- [ ] Page is gated to DEV role only
- [ ] Unit test for ring buffer insertion and eviction at capacity

## Blocked by

None — ingests existing `lib/logger.ts` output; no external dependencies
