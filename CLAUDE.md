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

## Deploying & handing off to Eugene for testing

PRISM **auto-deploys CODE when a non-docs PR merges to `main`**: GitHub Actions `deploy-to-vps.yml` SSHes to the VPS → `git pull` → `npm ci` → `npm run build` → `pm2 restart prism-v2` (~1–3 min). **It does NOT touch the database**, and **docs-only pushes (`docs/**`, `**.md`) skip the deploy entirely** (`paths-ignore`). **Test target = `dev.prismdashboard.org` (p2). `prismdashboard.org` is legacy p1 — untouched.**

**DB changes are a SEPARATE, MANUAL step (never automatic).** The auto-deploy will NOT apply schema — `db-push` lives only in the manual `npm run deploy` script (`scripts/deploy.sh`), not in the workflow. So per **Git before DB**: merge the code PR (code deploys), then apply the DB change to p2 yourself — `npm run db-push` (`drizzle-kit push --force`) for **drizzle-schema** changes, or run your **raw SQL** for data/views/backfills. Both halves are manual. **After a `db-push`, run `npm run db-seed`** — `push --force` can *recreate* a table and wipe its reference/seed rows (this is how `sectors` went to 0); `db-seed` (`scripts/seed.ts`, idempotent `onConflictDoNothing` across roles / managed-lists / sub-regions / sectors) restores them. **Timing depends on whether the change is additive or destructive** (`merged` ≠ `live` — there is a deploy lag, and it can be long if the pipeline is down):
- **Additive** (new column/table/value the new code needs): apply **promptly after merge**, so it exists before the new code goes live — else the new code references a not-yet-applied column and breaks (code-ahead-of-DB).
- **Destructive** (drop/rename a column, drop a table the *old* code still uses): apply **only after the new code is actually LIVE** — deploy green + `/api/health` ok. If you drop it while the old code is still serving (e.g. during a deploy lag/outage), the live code keeps selecting the gone column and errors. This exact case took `/api/organisations` down for ~10 min on 2026-09-02 (a column dropped while the deploy was stuck). This is expand/contract: **additive → DB first-ish; destructive → code-live first.**

(`npm run deploy` is a manual all-in-one that does `db-push` THEN commits+pushes to `main`; the canonical flow is still PR→merge for code, then `db-push` for schema.)

**Standard deploy → test handoff — every agent, every time:**
1. Merge your PR to `main` (that IS the deploy trigger).
2. **Confirm it's actually live BEFORE telling Eugene anything** — never "do X once it deploys":
   - Watch the deploy to success:
     `gh run watch $(gh run list --workflow=deploy-to-vps.yml -L1 --json databaseId --jq '.[0].databaseId') --repo taiatiniyara/prism --exit-status`
   - Then confirm the app is up: `curl -s https://dev.prismdashboard.org/api/health` → `"status":"ok"` with a low `uptime_seconds` (proves the restart landed).
   - (Your own deeper check: `GET /api/deployment/info` returns the live `commitSha` — DEV-role gated.)
3. Send Eugene ONE message in this EXACT format (no variations):
   > ✅ READY TO TEST — `<change>`
   > Live on **dev.prismdashboard.org** · commit `<sha>` · deploy ✅ · health ok
   > **Re-login?** **YES / NO** — `<reason>`
   > **Test:** 1) … 2) …  · **Expected:** …

**Re-login decision — always state it explicitly:**
- **YES (log out, log back in)** if the change touched auth: `BETTER_AUTH_SECRET`, the `session`/`user`/`account` tables (schema via `db-push --force` drops sessions), cookie/domain/`BETTER_AUTH_URL`, or 2FA/TOTP.
- **NO — just refresh** for everything else, incl. role / org / permission / sidebar changes (they take effect within ~5s on the next navigation; `proxy.ts` caches role for 5s).
- Sessions also expire after 24h regardless of any change.

(Set by Eugene 2026-09-02.)

## Start every change on a FRESH branch off origin/main

Before your **first commit** of any change, cut a **new** branch from **current `origin/main`** — never commit onto whatever branch happens to be checked out. In this shared multi-session tree the checkout is often an old, already-merged, or stale branch; committing there means realising too late and **redoing the commit on a new branch** (wasted work/tokens).

```
git fetch origin && git switch -c <descriptive-name> origin/main
```
(or `git worktree add <path> origin/main` for isolated/parallel work — the pattern the coordination session uses). If unsure what branch you're on, run `scripts/repo-truth.sh` first (it prints your branch + how it compares to origin/main).

Safety net: the `pre-commit` hook prints an **advisory** (never blocks) when your first commit is landing on a branch that has no commits beyond `origin/main` and is behind it — i.e. not cut from current `origin/main`. Heed it and re-branch before continuing. (Set by Eugene 2026-09-02.)

## Deploys are serialized — don't merge-storm

**Root cause of the 2026-09-02 pipeline outages: concurrent merges → concurrent deploys.** Every non-docs merge to `main` triggers `deploy-to-vps`, which SSHes into the **shared** `/root/prism` on the VPS and runs `git pull → rm -rf node_modules → npm ci → build → pm2 restart`. Two deploys running at once race on that one directory — one `rm -rf node_modules` lands mid-`npm ci` of the other → corrupted `node_modules` / npm cache (the ENOTEMPTY + ENOENT failures).

**ENFORCED (the means):** the deploy workflow now carries `concurrency: { group: deploy-to-vps, cancel-in-progress: false }`, so **deploys run strictly one at a time** — a merge landing while a deploy is running QUEUES its deploy instead of colliding, and a running deploy is never interrupted mid-install. GitHub serializes this; no coordination lapse can defeat it.

**Still the practice:** **sequence merges to `main`, one at a time — don't fire several concurrently.** When multiple PRs are ready together, land them one-by-one (ideally let each deploy go green before the next). #1 (coordination) sequences merges when several streams are ready at once. The concurrency gate makes concurrent merges *safe*; a one-at-a-time cadence keeps deploys fast and history clean. (Set by Eugene 2026-09-03; root-caused by his engineer.)
