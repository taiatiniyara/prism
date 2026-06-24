# Issue 2 — Environment & Config Viewer

## What to build

A read-only `/settings/config` page for DEV users that shows every environment variable the app knows about. Variables are displayed with status badges: **Set** (green, with first 4 + last 4 characters), **Unset** (yellow, flagging what's missing), or **Unknown** (grey, keys only in `.env.example` that aren't recognized by the app).

An API endpoint `GET /api/dev/config` returns the structured list with redacted values. The page also derives feature flags from config state: "Power BI enabled" (all 5 vars set), "SMTP configured" (all 4 vars set), "AI available" (`ANTHROPIC_API_KEY` set).

A diff section compares what's defined in `.env.example` against what's actually set at runtime, highlighting any keys present in the example file but missing from the environment.

## Acceptance criteria

- [ ] `GET /api/dev/config` returns `{ vars: [{ key, status: "set"|"unset", preview, exampleValue }], flags: [...] }`
- [ ] Secret values (any key containing `SECRET`, `KEY`, `PASS`, `TOKEN`) are redacted to `XXXX...XXXX` (first 4 + last 4)
- [ ] Non-secret values show full value (e.g., `DATABASE_URL` is a secret; `NEXT_PUBLIC_APP_URL` is not)
- [ ] `/settings/config` page renders as a table with status badge column, key column, preview column, and notes
- [ ] Feature flags section shows derived boolean states with icons
- [ ] Diff section shows items from `.env.example` that are missing at runtime
- [ ] Page is gated to DEV role only
- [ ] Unit test for the redaction logic

## Blocked by

None — can start immediately
