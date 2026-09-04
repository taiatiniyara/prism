# Schema Drift & Agent-Safety Guardrails

**Purpose.** A shareable reference of the practices that keep AI coding agents safe against a live database — written after a `data_entries` wipe on 2026-09-04. The core mechanism is simple: **the guardrails live in `CLAUDE.md` (the agents' standing instructions) plus one reusable check script.** Any Claude agent reads `CLAUDE.md`, so adopting these = adding the rules to your agents' `CLAUDE.md` and copying the script.

---

## 1. What happened (the "why")

`data_entries` was wiped to **0 rows**. Root cause: schema changes were made on **two hand-synced tracks** —

1. the **Drizzle model** (`db/schema/*.ts`), and
2. **raw SQL** applied directly to the database (`scripts/sql/*.sql`),

— which **drift apart** over time (a column/constraint/type applied to one track and not the other, or applied slightly differently). Nothing automatically kept them in lockstep. When that accumulated drift was finally reconciled with **`drizzle-kit push --force`**, push **recreated the drifted table and dropped every row.**

The lesson: the drift was real, but **the tool used to fix it is what caused the loss.** `push --force` resolves drift by `ALTER`/`RECREATE` toward the model, and a recreate drops the data.

---

## 2. The reusable tool — a read-only drift check

`scripts/schema-drift-check.ts` introspects the live DB's `information_schema` and diffs it against the Drizzle model. It is **strictly read-only — it can never `ALTER`, `DROP`, or write anything** (it is *not* `db-push`).

- Reports: missing/extra columns, data-type mismatches, nullability mismatches, and DB-only columns not in the model (a sign of hand-SQL that never made it back into the model).
- Run: `npm run drift-check` — add `--github` to emit `::error::`/`::warning::` lines for inline PR annotations.
- Exit codes: **0** in sync · **1** drift detected · **2** couldn't run (no creds / DB unreachable).
- It's generic Drizzle + Postgres, so it drops into any project on that stack.

**Where to run it:**

- **CI on every PR** — fail the PR only on exit 1; treat exit 2 (DB unreachable) as a non-blocking warning.
- **On a schedule against the live DB** — CI only fires on PRs, but drift also enters via **manual SQL applied out-of-band**. A daily scheduled run catches that before it accumulates.
- Give CI/the scheduler a **read-only DB role** (least privilege) — the check only needs `SELECT` on `information_schema`.

---

## 3. The golden rule (this one alone prevents the incident)

> **Never run `drizzle-kit push --force` against a live database without (a) a fresh backup and (b) reviewing the generated plan.**

Reconcile real drift with a **reviewed migration** (`drizzle-kit generate`), not a blind force-push. And **pick one source of truth** so the two tracks can't silently diverge:

- **Drizzle-first:** all schema changes go through `drizzle-kit generate` migrations from the model; never diverging hand-SQL. (Data-only SQL — backfills, cleanups — stays raw; it's *structural* drift you're eliminating.)
- **DB-first:** keep hand-writing SQL, but run `drizzle-kit introspect`/pull after each change so the model is regenerated *from* the DB and can't drift.

---

## 4. The `CLAUDE.md` guardrails your agents should adopt

These are the standing rules that made every risky change safe. They're project-agnostic — copy them into your agents' `CLAUDE.md`:

- **Git-before-DB.** Code committed + pushed (ideally PR-merged) *before* any DB change. The DB reflects git, never the reverse.
- **Back up before any destructive change.** Snapshot the affected rows to `backup.*` tables first, with a full inbound-FK sweep, all in **one atomic transaction** (all-or-nothing — any error rolls the whole thing back).
- **Dry-run destructive migrations.** Run the entire migration inside `BEGIN … <verify row counts> … ROLLBACK` against the real DB first, confirm the outcome and that no FK step errors, *then* apply for real.
- **Expand/contract for schema changes.** *Additive* (new column/table) → apply promptly after merge. *Destructive* (drop/rename a column the old code still selects) → apply **only after the new code is actually LIVE** (deploy green + health check), or the live code errors on the missing column.
- **Read-only pre-flight before writes.** Verify assumptions against the live DB (`SELECT`/introspection) before any DML/DDL — confirm counts, FK dependencies, and that referenced objects exist.
- **Verify against `origin`, not the local checkout.** In a shared or multi-agent working tree, the local checkout lies about repo state — compare only against `origin/*`.
- **Drift check in CI + on a schedule** (section 2).

---

## 5. Artifacts to copy

- `scripts/schema-drift-check.ts` and the `drift-check` npm script.
- The `CLAUDE.md` sections: *Git before DB*, *Verify against ORIGIN*, the *Deploy / expand-contract* protocol, and the *drift-check + no-force-push-without-backup* rule.

---

## 6. How to adopt (for your agents)

1. Copy `scripts/schema-drift-check.ts` (or run the existing one) and wire `npm run drift-check --github` into CI (fail on exit 1) + a daily scheduled run against the live DB.
2. Create a **read-only DB role** for those checks.
3. Add the section-4 rules to your agents' `CLAUDE.md` — that's what makes the agents *follow* the discipline, since they read it as standing instructions.
4. Decide your single source of truth (section 3) and stop the diverging track.
5. Bake the golden rule into whatever runs `db-push`: require a backup + a reviewed plan first (and rename any misleadingly "safe" alias that's actually a force-push).
