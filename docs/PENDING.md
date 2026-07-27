# PRISM 2 — Pending Work Tracker

**Owned by session `PRISM 2 #15` (pending-tracker).** Single place that answers *"what is pending — uncommitted, unpushed, unmerged, or un-applied — across every stream?"* so nobody has to keep asking.

> Absolute path (sessions run from different folders / worktrees):
> `C:\Users\eugen\prism\docs\PENDING.md`

**How "pending" is defined here** — five gates a change passes through, left to right:

`working tree → committed → pushed → PR merged to main → DB change applied`

A row is *pending* if it has not cleared all the gates that apply to it. Docs-only changes stop at "merged" (no DB gate); schema/DDL changes are only truly done once **applied to the dev DB**.

---

## ⚡ TL;DR (snapshot 2026-07-27, refresh 2)

- **The main working tree is mid-reconcile.** Local `main` has **diverged from `origin/main` (ahead 1 / behind 3)**: one **unpushed commit** (`f043013`, #10 benchmarking_group guardrail) sits on local `main`, and origin has 3 newer commits not yet pulled → **someone needs to pull+merge+push** to converge. This is the single most actionable pending item right now.
- **No feature PR is stuck.** All human PRs are merged; only 13 Dependabot bumps (#37–#49) are open.
- **Uncommitted in the main tree (4 files):** the board `WORKSTREAMS.md`, **#3's `calculator-engine-spec.md`**, `docs/multi-level-hierarchy-requirements.md` (#8), `docs/security-remediation.md` (#12) — plus this file's in-place refresh.
- **#8's schema-convention decision is RESOLVED** (Eugene ruled *hybrid freeze-as-built*, commit `7c01627`) → dropped from "Awaiting Eugene"; unblocks #2/#3/#14.
- **The rest of the backlog is *decisions*, not code** (see "Awaiting Eugene").

---

## 1. Repo git-pipeline snapshot (objective — regenerate with §4)

### Main working tree (`C:\Users\eugen\prism`, branch `main`)
- **Sync:** ⚠ **diverged — ahead 1 / behind 3.**
  - **Unpushed (ahead 1):** `f043013` `docs(#10): align §2.1 benchmarking_group guardrail with #8's hybrid ruling` — committed to local `main`, **not on origin**. → needs push.
  - **Unpulled (behind 3):** origin advanced to `884a315` (`7c01627` #8 ruling, `e3f64a0`/`884a315` "more api routes", `825fd37` merge). → needs pull.
  - **Action:** whoever next drives the tree: `git pull --no-rebase` (or fetch+merge) to fold origin's 3 in, then `git push` `f043013`. Until then local `main` ≠ origin.
- **Uncommitted (4 files):**
  | File | Stream | What | Handling |
  |------|--------|------|----------|
  | `docs/calculator-engine-spec.md` | #3 | spec edits (active WIP) | left for #3 to commit |
  | `docs/multi-level-hierarchy-requirements.md` | #8 | doc edits post-ruling | left for #8 |
  | `docs/security-remediation.md` | #12 | log edits | left for #12 |
  | `docs/WORKSTREAMS.md` | board | multi-session notes incl. #15's row | rides the normal board commit flow (do **not** yank onto a feature branch — would strip other sessions' in-place notes) |

  *(This `PENDING.md` refresh is also uncommitted in-place; it rides the next tree reconcile/push rather than a separate PR, to avoid adding to the divergence above.)*

### Worktrees
| Path | Branch | State |
|------|--------|-------|
| `C:/Users/eugen/prism` | `main` | see above |
| `C:/Users/eugen/prism-bsc` | `feat/bsc-input-kpi-picker` | **clean; fully merged** into `main` (PR #35). Nothing pending. Branch has no upstream but no unmerged commits either — safe to leave or delete. |

### Open PRs (13 — all Dependabot, awaiting human triage)
Not owned by any stream; a maintenance decision for Eugene. None blocking.
`#49` read-excel-file 7→9.3.4 · `#48` eslint-plugin-security · `#47` **typescript 5.9→7.0.2 (major)** · `#46` jest-dom 6→7 · `#45` @types/node 20→26 · `#44` eslint 9→10 · `#43` lucide-react 0.5→1.27 · `#42` @ai-sdk/anthropic 3→4 · `#41` production-deps group (20) · `#40` dev-deps group (6) · `#39` codeql-action 3→4 · `#38` actions/checkout 4→7 · `#37` ssh-action.

### Local branches merged but not pruned (housekeeping, not pending work)
All correspond to **merged** PRs (most via squash, so `git` ancestry can't see them — confirmed via `gh`). Safe to delete locally:
- `: gone` upstream (true merges): `feat/bsc-builder`, `chore/remove-legacy-bsc-tabs`, `fix/bsc-autosave-empty-rows`, `fix/settings-bsc-template-link`
- squash-merged (remote branch may still exist): `feat/ensure-country` (#62), `feat/m49-primary-keys` (#60), `feat/sectors-reference-table` (#65), `feat/un-m49-references` (#59), `feat/multi-sector-terminology-resolutions` (#56), `fix/ensure-country-autoseed` (#64), `chore/drop-country-id-sequences` (#61), `security/mfa-retro-review` (#63)

---

## 2. Per-stream pending ledger (from the board)

Legend: ✅ nothing pending · 📝 uncommitted · ⬆️ committed-not-pushed · 🔀 pushed-not-merged · 🗄️ merged-but-DB-not-applied · ⏳ waiting on Eugene/other stream

| # | Stream | Code pending | DB apply pending | Waiting on | Verdict |
|---|--------|--------------|------------------|-----------|---------|
| 1 | Project mgt | — | — | — | ✅ |
| 2 | Medallion migration | — (DDL done + verified on DB) | data **reload** via `migrate.ts` + `input_dl_def_mappings` regen (not DDL) | ⏳ Eugene's sample extract | ⏳ paused |
| 3 | Calculator engine | — (design + mockup approved) | schema tracer-bullets deferred | ⏳ #2 landing | ⏳ gated |
| 4 | Schema for AI | — (authored energy-dim rename, PR #68 merged+applied) | — | — | ✅ |
| 5 | BSC Builder | — (PR #35 merged; worktree clean) | — | ⏳ #2 `kpi_target` for Input-tracked targets (deferred) | ✅ / ⏳ deferred |
| 7 | KPI calculator | — (not started/unconfirmed) | — | ⏳ #3 | ⚪ |
| 8 | Multi-level hierarchy | 📝 `multi-level-hierarchy-requirements.md` edits uncommitted | — (no DDL of its own; #2 owns) | ✅ **RESOLVED** — Eugene ruled hybrid freeze-as-built (`7c01627`); remaining = app-layer query pass (w/ #11) gated on #2's DDL amendments | 📝 → then ⏳ #2 |
| 10 | Access / registration | ⬆️ `f043013` committed to local `main`, **unpushed** | — | ⏳ Eugene: default-plan contents + member entitlements | ⬆️ + ⏳ |
| 11 | UI / frontend | — (Phase 5a merged, PR #58) | — | ⏳ #2 Phase-5b DDL (`sector_terminology` etc.) | ⏳ gated |
| 12 | Security hardening | 📝 `security-remediation.md` uncommitted | — (all merged; MFA applied to DB) | ⏳ Eugene: P2/D2 `API_KEY` split. **D1 RLS: column decided** (denormalized `utility_id` per #8's ruling) → remaining is #12 *writing the policy DDL*, not a Eugene call | 📝 / ⏳ |
| 13 | Multi-sector | — (#55/#56/#58/#60/#61/#62/#64/#65 merged; DB changes applied) | — | ⏳ Phase-5b/5c deferred (with #2/#11) | ✅ / ⏳ deferred |
| 14 | Data-entry / fixes | — (`powerStationDnD.tsx` nit fixed by #4, `f2f3cba`) | — (energy-dim rename PR #68 already applied) | — | ✅ |
| 15 | Pending tracker | ✅ `PENDING.md` merged (PR #71, `01272c0`); refresh 2 uncommitted in-place | — | — | ✅ |

**Net pending right now:** the tree divergence (push `f043013` + pull origin's 3) is the one actionable git item; the rest is uncommitted doc WIP owned by #3/#8/#12 + decisions on Eugene. #8's convention ruling cleared the biggest blocker.

**Doc-debt (flagged by #8):** #2's medallion spec (`schema-redesign-medallion.md` §1.4/§1.5) still describes "All areas" NOT-NULL grain targets, now **contradicted** by the hybrid ruling. #2 asked to amend; tracked here until they do.

### Recently applied DB changes (done — do NOT re-run; informational)
Direct DML/DDL on the shared **dev** DB with no commit/PR (or applied ahead of a PR). Recorded so no session re-runs them and everyone knows the DB state:
- **2026-07-27 (#14):** `countries` name corrections to UN M49 canonical forms — 583→"Micronesia (Federated States of)", 612→"Pitcairn", 876→"Wallis and Futuna Islands". Name-only (ids unchanged/M49-correct), FK-safe, guarded txn; backup `backup.countries_names_20260727`.
- **2026-07-27 (#14):** American Samoa `id 1→16` (M49 re-key of the last serial-id singleton).
- **2026-07-27 (#12):** admin MFA migration (`user.two_factor_enabled`, `session.two_factor_verified_at`, `two_factor` table) applied to the `.env` DB — additive/idempotent, **do not re-run** `scripts/apply-mfa-migration.ts`.
- **2026-07-27 (#4/#14):** energy-dim column physicalisation (PR #68) applied — `provider_id`/`category_id`/`technology_id`/`asset_id`/`unit_id`, table `units`, views rebuilt, `formula_inputs` JSON keys renamed 67 rows; backups `backup.*_20260727`.
- **2026-07-27 (#13):** M49-as-PK dedupe on `countries`/`sub_regions` + dropped id sequences + ISO-4217 currency seed (PRs #60/#61/#62/#64/#65). Applied.

---

## 3. Awaiting Eugene (decisions that unblock merges)

| Stream | Decision needed | Blocks |
|--------|-----------------|--------|
| #2 | provide the real **sample data extract** | the medallion data reload (last step of the migration) |
| #10 | **default-plan contents** + **member entitlements** (the free `member` plan's sector-scoped dashboard set; `member` is now association-agnostic — PPA→electricity, PWWA→water/sanitation) | tiered-access schema (no code until settled) |
| #12 | **P2/D2** `API_KEY` split | secret hygiene |
| — | triage the **13 Dependabot PRs** (esp. #47 TypeScript 7 major, #45 @types/node 26) | dependency currency |

*Cleared since refresh 1:* **#8** schema-convention (Eugene ruled hybrid freeze-as-built, `7c01627`). **#12 D1** is no longer a Eugene decision — the RLS tenant column is decided (`utility_id`); #12 now just writes the policy DDL (policy must handle `utility_id IS NULL` shared country-level rows).

---

## 4. Refresh command (regenerate §1 in seconds)

Run from the repo root; paste the output into §1 and bump the TL;DR timestamp.

```bash
git fetch origin -q && \
echo "## main sync:" && git rev-list --left-right --count origin/main...main | awk '{print "behind "$1" / ahead "$2}' && \
echo "## uncommitted:" && git status -sb && \
echo "## worktrees:" && git worktree list && \
echo "## open PRs (non-dependabot first):" && gh pr list --state open --limit 50 --json number,title,author --jq 'sort_by(.author.login) | .[] | "\(.number) [\(.author.login)] \(.title)"' && \
echo "## local branches merged per gh (prune candidates):" && for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do pr=$(gh pr list --state merged --head "$b" --json number --jq '.[0].number' 2>/dev/null); [ -n "$pr" ] && echo "$b -> merged in PR #$pr"; done
```

> **Merged-detection note:** PRISM squash-merges, so `git merge-base --is-ancestor <branch> main` reports squash-merged branches as *not* merged. Always read the merge gate from `gh pr list --state merged`, never from git ancestry.

---

*Maintenance: #15 refreshes §1 on each sync and reconciles §2–§3 against `WORKSTREAMS.md`. Other streams: when you commit/push/merge/apply-DB, it will show up here on the next refresh — you don't need to edit this file, but a one-line ping to #15 (or a board update) keeps §2–§3 tight.*
