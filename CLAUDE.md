# PRISM — project instructions

## Multi-session coordination (READ FIRST)

**Project session tag: `PRISM 2`** — every session working on this repo is titled `PRISM 2 #<n> <name>`. This tag is the authoritative grouping key: to reach this project's other streams (e.g. the auto merge/DB-change alert), call `list_sessions` and message every other session whose title starts with `PRISM 2`. Do NOT group by folder — sessions run from `C:\Users\eugen`, worktrees, etc., so `cwd` is unreliable.

Multiple Claude Code sessions work on PRISM concurrently (the "PRISM 2" sidebar group). They do **not** see each other's conversations — the shared board is the only channel between them.

- **On start:** read `C:\Users\eugen\prism\docs\WORKSTREAMS.md` (absolute path — sessions run from different folders, including git worktrees) to learn the current state of every stream.
- **When your status changes** (start/pause/block/finish a chunk, or a cross-stream dependency changes): update *your own* row in that file — status emoji, `Last update` date, and one line on what changed. Edit only your own stream's section.
- **Before a large refactor** on the main working tree, check the board for other active sessions touching the same files (uncommitted changes can clobber each other); prefer a git worktree for parallel edits.

See the board's own Protocol section for full details.

## Git before DB — NO EXCEPTIONS

Code goes into git **before** any change is applied to the database. Never run a migration / DDL / DML against the p2 database until the corresponding schema / migration / code is committed **and pushed** to git — ideally merged to `main` via PR. The order is always:

1. **git first** — schema/migration/code committed + pushed (PR-merged where possible)
2. **then** apply the DB change to the p2 database

**One instance — no "prod cutover":** p2 runs on a **single** database (the `.env` / Supabase instance). There is **no separate p2 production database** — at launch, production URLs are simply repointed to this instance, so the DB you change **is** the future prod. Do **not** frame changes as "dev only" or defer them to a "prod cutover", and don't write `Per-env (dev, then prod)` headers; a write applied here is applied, period. (`prismdashboard.org` today is the **legacy p1** system — the migration's data *source*, not a p2 prod target.)

**Exempt:** read-only work is not a "change" and is unrestricted — verification queries, pre-flight checks, `EXPLAIN`, `SELECT`, schema introspection. The rule governs writes only (migration / DDL / DML that alters data or structure).

Rationale: a DB change with no committed code leaves the schema ahead of the code, so every session that pulls is out of sync with the live database. Git is the source of truth; the DB reflects it, never the reverse. (Set by Eugene 2026-08-24; single-instance clarification added 2026-09-01.)

## Verify against ORIGIN, not the local checkout

The source of truth for repo state is **`origin`**, never the local checkout. In this shared multi-session tree the working directory is routinely checked out on someone else's feature branch, left dirty, or tens of commits behind — so the local `main` ref, `HEAD`, and the working tree all **lie** about "what is in the repo." Verifying against them is the root of every recurring false "divergence" alarm.

Before asserting anything about what is or isn't in the repo:

1. **`git fetch origin` first** — always, every time.
2. **Compare only against `origin/*` refs** (`origin/main`), never bare `main` / `HEAD` / the working tree.
   - "Is X in the repo?" → `git merge-base --is-ancestor <sha-or-branch> origin/main`.
   - **Never** `git log origin/main..main` — that silently reads your STALE local `main`.

**Canonical tool — use it instead of hand-rolling git:** `scripts/repo-truth.sh` fetches origin, then reports strictly against `origin/main` (summary, `<commit>` membership, or `--file PATH`). It removes the checkout-relative commands that cause the false alarms. (Set by Eugene 2026-09-01.)

## Never let a PR wipe the repo

On 2026-09-01 PR #213 (a one-line docs change) deleted the **entire repo** — 1551 files incl. the `WORKSTREAMS.md` / `STREAM-ACTIVITY.md` boards — because it was built in a `git worktree add --no-checkout` / partial-stage worktree: the commit recorded a tree of only the staged file, so every other file counted as deleted, and the merge applied that. Recovered by revert, but hugely disruptive. Two hard rules + one guard:

1. **Never build a commit in a `--no-checkout` or otherwise partial working tree.** Use a **full** checkout so the commit's tree is complete. The slower checkout is worth it.
2. **Before merging ANY PR — especially "docs-only" — verify the diff scope.** `gh pr diff <n> --stat` (or `git diff --stat origin/main <branch>`); a small change touching hundreds/thousands of files must never merge.
3. **Enforced by the pre-commit hook** (`.githooks/pre-commit`; live in `.git/hooks`): it blocks any commit that deletes ≥30% of the tree (override for genuine mass removals: `git commit --no-verify`). Activate on a fresh clone with `git config core.hooksPath .githooks`. (Set by Eugene 2026-09-01.)

## Dependencies (node_modules) — recovery & ownership

`node_modules` is **gitignored / untracked** — git never deletes or restores it, and a repo wipe/revert does **not** affect it. It is a rebuildable, per-checkout artifact. Layout here: the **main tree** (`C:/Users/eugen/prism`) holds the real install; `prism-ui` / `prism-bsc` **junction** to it (one install serves all three); `prism-calc` has its own.

**Recovery (the whole fix):**
```
cd C:/Users/eugen/prism && npm ci      # ~2 min; restores tsc/eslint/build/dev for main + junctioned worktrees
```
`npm ci` is deterministic from `package-lock.json`. Treat empty `node_modules` as a 2-minute fix, not a crisis.

**Who is responsible:**
- **Self-service first:** any session that finds `node_modules` empty runs `npm ci` in the main tree — it unblocks all junctioned worktrees at once. Do not wait or escalate; it's cheap. The `post-merge` / `post-checkout` nudge hooks warn you when deps look missing/stale.
- **Accountable owner / backstop: #1 (coordination).** If you're blocked and can't run it (e.g. the main tree is mid-work on another session's branch, or you're unsure), ping #1 and #1 restores it.

**Do NOT** run `npm ci`, `git clean -xfd`, or `rm -rf node_modules` against a **broken or mid-recovery** tree: `npm ci` deletes `node_modules` *before* installing, so a failed install (e.g. missing `package.json`) strands you empty — which is how this got wiped on 2026-09-02. When the tree state is uncertain, use plain `npm install` (no pre-delete). (Set by Eugene 2026-09-02.)
