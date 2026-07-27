# PRISM 2 — Pending Work Tracker

**Owned by session `PRISM 2 #15` (pending-tracker).** Single place that answers *"what is pending — uncommitted, unpushed, unmerged, or un-applied — across every stream?"* so nobody has to keep asking.

> Absolute path (sessions run from different folders / worktrees):
> `C:\Users\eugen\prism\docs\PENDING.md`

**How "pending" is defined here** — five gates a change passes through, left to right:

`working tree → committed → pushed → PR merged to main → DB change applied`

A row is *pending* if it has not cleared all the gates that apply to it. Docs-only changes stop at "merged" (no DB gate); schema/DDL changes are only truly done once **applied to the dev DB**.

---

## ⚡ TL;DR (snapshot 2026-07-27 20:33)

- **No feature work is stuck unmerged or unpushed.** Every human PR to date is merged; the only open PRs are 13 Dependabot bumps (#37–#49) awaiting a human decision.
- **`main` is in sync with `origin/main`** (PR #70 pulled).
- **Uncommitted in the main tree:** the board (`WORKSTREAMS.md`, live multi-session notes), **#3's `calculator-engine-spec.md`** WIP, and this file (`PENDING.md`, being PR'd). The earlier `powerStationDnD.tsx` nit was **fixed by #4 on main** (`f2f3cba`) — no longer pending.
- **The real backlog is *decisions*, not code**: several streams are parked waiting on Eugene (see "Awaiting Eugene" table).

---

## 1. Repo git-pipeline snapshot (objective — regenerate with §4)

### Main working tree (`C:\Users\eugen\prism`, branch `main`)
- **Sync:** in sync with `origin/main` (PR #70 pulled).
- **Uncommitted:**
  | File | Stream | What | Handling |
  |------|--------|------|----------|
  | `docs/calculator-engine-spec.md` | #3 | spec edits (active WIP) | left for #3 to commit |
  | `docs/WORKSTREAMS.md` | board | multi-session notes incl. #15's own row | rides the normal board commit flow (do **not** yank onto a feature branch — would strip other sessions' in-place notes) |
  | `docs/PENDING.md` | #15 | this tracker (new) | being PR'd via `docs/pending-tracker` |

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
| 8 | Multi-level hierarchy | — (requirements doc committed) | — (no DDL of its own; #2 owns) | ⏳ **Eugene: schema-convention divergence** (hybrid freeze-as-built vs sentinel-member) | ⏳ |
| 10 | Access / registration | — (no code yet) | — | ⏳ Eugene: default-plan contents + PPA-member entitlements | ⏳ paused |
| 11 | UI / frontend | — (Phase 5a merged, PR #58) | — | ⏳ #2 Phase-5b DDL (`sector_terminology` etc.) | ⏳ gated |
| 12 | Security hardening | — (all merged; MFA applied to DB) | — | ⏳ Eugene: P2/D2 `API_KEY` split, D1 RLS into #2/#8 | ✅ / ⏳ |
| 13 | Multi-sector | — (#55/#56/#58/#60/#61/#62/#64/#65 merged; DB changes applied) | — | ⏳ Phase-5b/5c deferred (with #2/#11) | ✅ / ⏳ deferred |
| 14 | Data-entry / fixes | — (`powerStationDnD.tsx` nit fixed by #4, `f2f3cba`) | — (energy-dim rename PR #68 already applied) | — | ✅ |
| 15 | Pending tracker | 🔀 `PENDING.md` in PR `docs/pending-tracker` | — | — | 🔀 |

**Net pending right now:** this tracker (in PR) + #3's spec WIP + the board's normal churn; everything else is either done or waiting on a decision.

---

## 3. Awaiting Eugene (decisions that unblock merges)

| Stream | Decision needed | Blocks |
|--------|-----------------|--------|
| #2 | provide the real **sample data extract** | the medallion data reload (last step of the migration) |
| #8 | pick the `data_entries` **schema convention**: hybrid "freeze as-built" (denormalized chain, no sentinel grain rows) **vs** sentinel "All"-member grain columns | any further #2/#8 shared-table DDL |
| #10 | **default-plan contents** + **PPA-member entitlements** | tiered-access schema (no code until settled) |
| #12 | **P2/D2** `API_KEY` split; **D1** fold RLS owning-org column into #2/#8 `data_entries` DDL | RLS defence-in-depth |
| — | triage the **13 Dependabot PRs** (esp. #47 TypeScript 7 major, #45 @types/node 26) | dependency currency |

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
