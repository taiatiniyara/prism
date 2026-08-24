# PRISM 2 — Pending Work Tracker

**Owned by session `PRISM 2 #15` (pending-tracker).** Single place that answers *"what is pending — uncommitted, unpushed, unmerged, or un-applied — across every stream?"* so nobody has to keep asking.

> Absolute path (sessions run from different folders / worktrees):
> `C:\Users\eugen\prism\docs\PENDING.md`

**How "pending" is defined here** — five gates a change passes through, left to right:

`working tree → committed → pushed → PR merged to main → DB change applied`

A row is *pending* if it has not cleared all the gates that apply to it. Docs-only changes stop at "merged" (no DB gate); schema/DDL changes are only truly done once **applied to the dev DB**.

---

## ⚡ TL;DR (snapshot 2026-07-28, refresh 4)

- **Tree clean and in sync with `origin/main`.** ⚠ deps changed → run `npm install` after your next pull.
- **Only one uncommitted file:** **#3's `calculator-engine-spec.md`** (active WIP, left for #3).
- **Open PRs: 20** (re-scan 2026-08-24) — **4 human** (`#104` data-availability, `#83` #12 USER-IMPACT rows, `#77` #11 access-plans proto, `#76` #12 RLS-D1) + 16 Dependabot. `#107` (measures/status-enum) merged. ⚠ **Dependabot vuln count jumped 4 → 24** (per #8, flagged to #12).
- **Cleared this session:** #8 schema-convention ruling (`7c01627`); #12 D2 API_KEY split merged (`167f080`); both sentinel-deletion confirmations (#2 views, #10 access); safe Dependabot subset merged.
- **Awaiting Eugene — 4:** #2 medallion sample extract; #10 default-plan + member entitlements; #4 country-context history load; **subgroup-221 disposition** (prepped, awaiting #4 fact) + **3 null `financial_year_end`** values.
- **Applied DB changes today** (informational, all backed up): sentinel-chain deletion, `measure_definitions.description` drop, managed-lists vocab rename — plus the follow-on `units.category_id`/`type_id` DROP still owed by #2.

---

## 1. Repo git-pipeline snapshot (objective — regenerate with §4)

### Main working tree (`C:\Users\eugen\prism`, branch `main`)
- **Sync:** ✅ in sync with `origin/main` (`6cda722`, #8's docs sweep). Prior ahead-1/behind-3 divergence resolved.
- **Uncommitted (1 file):**
  | File | Stream | What | Handling |
  |------|--------|------|----------|
  | `docs/calculator-engine-spec.md` | #3 | spec edits (active WIP) | left for #3 to commit |

  *(This `PENDING.md` refresh 3 is uncommitted in-place; like refresh 2 it rides the next docs sweep rather than its own PR.)*

### Worktrees
| Path | Branch | State |
|------|--------|-------|
| `C:/Users/eugen/prism` | `main` | see above |
| `C:/Users/eugen/prism-bsc` | `feat/bsc-input-kpi-picker` | **clean; fully merged** into `main` (PR #35). Nothing pending. Branch has no upstream but no unmerged commits either — safe to leave or delete. |

### Open PRs (20 total — re-scan 2026-08-24)
> Method: full `gh pr list --state open` each refresh (pings are additive, not a substitute — see the Lesson in §4).

**4 human PRs (awaiting review/merge):**
- `#104` **docs(data-availability) §3.1.1** — obligation is dimension-aware.
- `#83` [#12] **sharpen USER-IMPACT rows 1 (MFA) + 4 (API-key)** — ⚠ **conflict risk:** edits `USER-IMPACT.md` rows 1/4 while `main` has grown rows 11–15; rebase before merge.
- `#77` [#11] **Access Plans (Tiered Access) DEV/BMO form — PROTOTYPE.**
- `#76` [#12/D1] **align RLS design to the `data_entries` ruling + no-sentinel rule** — the D1 RLS item (was "#12 to write policy DDL"; now a PR).
- *(merged since last scan: `#107` measures catalogue regen + status-enum, `#109` this tracker's re-scan, `#112` #8 country-context reconciliation.)*

**16 Dependabot PRs (Eugene reviews individually):** `#108` dev-deps group · `#101` js-yaml · `#97` ip-address · `#93` fast-uri · `#91` undici · `#89` @types/node 26.1.2 · `#88` jsdom 30 · `#87` read-excel-file 9.3.5 · `#86` lucide-react 1.28 · `#85` @ai-sdk/anthropic 4.0.25 · `#48` eslint-plugin-security · `#47` **typescript 7** · `#46` jest-dom 7 · `#44` eslint 10 · `#39` codeql-action 4 · `#38` actions/checkout 7.
> ⚠ **Dependabot vulnerability count jumped 4 → 24** (reported by #8 2026-08-24, flagged to #12) — a security-triage prompt, not a merge blocker; #12 to assess which advisories matter.

⚠ **main's deps changed earlier → run `npm install` after your next pull.**

**Also: ~15+ unmerged `claude/*` and `feat/*`/`security/*` branches ahead of main with no open PR** (e.g. `security/api-key-tiering` +2, `claude/data-availability-*`, `claude/apportioned-costs-spec`, `claude/evidence-surface`, `claude/not-applicable-rationale`). Mix of squash-merged leftovers and genuinely un-PR'd spec/work branches — needs a triage pass (are they merged-content, abandoned, or pending?). Flagged, not yet classified.

### Direct-to-main commits — hygiene watch (bypassed branch→PR per Protocol #6)
Recorded because the board's commit-hygiene rule asks for branch→PR; these landed straight on `main`. Not necessarily wrong (some are DB-coordinated), but flagged for visibility / optional retroactive review:
- `4316624` (**#14**) — drop `measure_definitions.description`. Retroactive-review PR offered to Eugene by #14.
- `3ead895` (**#14**) — drop `units.is_aggregated`. Same retro-review-PR offer stands.
- `98cf4e0` / `b7b8473` (**#4**) — energy-taxonomy vocab rename code + SQL. Any hygiene follow-up (retro-review PR) routes to **#4**. (#14 ran only the DB-side list-name UPDATEs — pure DML, no commit.)
- *(prior, already noted):* #12's MFA + S-series landed direct on `main` earlier → retroactive review PR #63.

*Note: #14's DB-only changes (country fixes, sentinel deletion, vocab list renames) are pure DML with no commit — they live in "Recently applied DB changes", not here.*

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
| 2 | Medallion migration | — (DDL done; PRs #75/#78 merged; `units` col DROP + `asset_class_id`/`strata_id` renames applied ✅) | data **reload** via `migrate.ts` + `input_dl_def_mappings` regen | ⏳ Eugene: sample extract (#2 reports no open items of its own) | ⏳ paused |
| 3 | Calculator engine | — (design + mockup approved) | schema tracer-bullets deferred | ⏳ #2 landing | ⏳ gated |
| 4 | Schema for AI | — (energy-dim rename #68; clearing last spec WIP) | — | ✅ **RATIFIED 2026-07-28** (derive-not-store: technology leaf, category/asset-class derived) — hold lifted | ✅ |
| 5 | BSC Builder | — (PR #35 merged; worktree clean) | — | ⏳ #2 `kpi_target` for Input-tracked targets (deferred) | ✅ / ⏳ deferred |
| 7 | KPI calculator | — (not started/unconfirmed) | — | ⏳ #3 | ⚪ |
| 8 | Multi-level hierarchy | — (requirements doc committed in `6cda722`) | — (no DDL of its own; #2 owns) | ✅ **RESOLVED** — Eugene ruled hybrid freeze-as-built (`7c01627`); remaining = app-layer query pass (w/ #11) gated on #2's DDL amendments | ⏳ #2 |
| 10 | Access / registration | — (guardrail change landed in `6cda722`) | — | ⏳ Eugene: default-plan contents + member entitlements | ⏳ |
| 11 | UI / frontend | — (Phase 5a #58 + Phase-5b active-sector seam #74/`9b94edc` merged, behaviour-neutral) | — | ⏳ #2 Phase-5b DDL (`sector_terminology` etc.) for the remainder | ⏳ gated |
| 12 | Security hardening | ✅ **PR #73 MERGED** (`167f080`, API_KEY tiering, no DB change) | — | **remaining P2/D2 = operator steps** (set `API_KEY_SENSITIVE`, repoint Power BI, rotate). **D1 RLS: column decided** (`utility_id`) → #12 writes the policy DDL | 🛠️ ops |
| 13 | Multi-sector | — (#55/#56/#58/#60/#61/#62/#64/#65 merged; DB changes applied) | — | ⏳ Phase-5b/5c deferred (with #2/#11) | ✅ / ⏳ deferred |
| 14 | Data-entry / fixes | — (`powerStationDnD.tsx` nit fixed by #4, `f2f3cba`) | — (energy-dim rename PR #68 applied; country name fixes applied — see below) | — | ✅ |
| 15 | Pending tracker | ✅ `PENDING.md` merged (PR #71); refresh 2 landed in `6cda722`; refresh 3 uncommitted in-place | — | — | ✅ |

**Net pending right now:** **4 human PRs awaiting review/merge** (#104, #83, #77, #76 — see §1); 16 Dependabot (+ ⚠ vuln count 4→24 for #12 to triage); Eugene decisions (#2 extract, #10 plan/entitlements, #4 country-context history, #8/#4 subgroup-221, 3 null `financial_year_end`); #12's P2/D2 operator steps (env/Power BI/rotate); **#11 follow-up** — make the BMO country-context metric field a select + add Update/upsert; **country-context repoint SQL** still to run per-env (prod); a branch-triage pass over the ~15 un-PR'd `claude/*` branches. `npm install` after pull.

**Doc-debt (flagged by #8):** #2's medallion spec (`schema-redesign-medallion.md` §1.4/§1.5) still describes "All areas" NOT-NULL grain targets, now **contradicted** by the hybrid ruling. #2 asked to amend; tracked here until they do.

### Recently applied DB changes (done — do NOT re-run; informational)
Direct DML/DDL on the shared **dev** DB with no commit/PR (or applied ahead of a PR). Recorded so no session re-runs them and everyone knows the DB state:
- **2026-08-23 (#4) — country-context repoint (Option 2)** (code merged `fcf8e4e`): `country_context` FK repointed `managed_list_items → measure_definitions`; `dl_def_id → measure_def_id` rename. Script `scripts/sql/2026-08-23-country-context-repoint-measure-def.sql`. **⚠ applied to dev only — must be run per-env (prod pending).** Follow-ups tracked below.
- **2026-08-03 (#2) — 10 legacy `managed_lists` DELETED** (+ their 60 `managed_list_items`), Eugene-approved cleanup: Aggregation Group/Method, Data Group, DLSource/KPISource Tables, KPI Requester, Measure Type, Necessity, Product Level, Service Relevance Group. 0 orphans (nothing referenced them); backups `backup.managed_lists_del_20260803` / `backup.managed_list_items_del_20260803`. Direct DML, no commit. ✅ Journey-affecting — USER-IMPACT **row 15** (BMO-visible in Managed Lists settings; all vestigial).
- **2026-07-28 (#10) — legacy `external_registrations` table DROPPED** (PR #79 `30f0f72`; 0 rows). Also removed pgTable+types from `db/schema/auth-schema.ts` and deleted the `app/settings/external-registrations` console. Superseded by the pending-user flow (`user.status`) + future `access_request`. Schema+DB in sync.
- **2026-07-28 (#14) — `units.is_aggregated` column DROPPED** (unused). Code `3ead895` (direct-to-main — see hygiene watch); DB column dropped on dev (guarded txn, verified), 501 rows backed up to `backup.units_is_aggregated_20260728`. Schema+DB in sync.
- **2026-07-28 (#2/jolly) — `asset_id→asset_class_id` / `agg_level_id→strata_id` column renames** (PR #78 `f06e3d5`) — 7 columns across `data_entries`/`energy_resource_type_relevance`/`managed_list_items`/`measure_definitions`/`kpi_definitions`/`service_areas`/`units`. Metadata-only, no views; tsc + 384/384 tests green. DDL applied to dev DB.
- **2026-07-28 (#2/jolly) — `units.category_id`/`type_id` columns DROPPED** (closes #4's `935847b` derive refactor; code was already merged, DB now matches). 501 rows intact, no view deps; backups `backup.units_dropped_cols_20260728` / `backup.units_pre_assetclass_20260728`.
- **2026-07-28 (#14, w/ #4) — `managed_lists`/`managed_list_items` vocab rename** (energy-taxonomy → new names): list id1→Strata, id2→Provider, id3 Category, id4 Technology, id55→Asset Class; item mli id1→Unit. Code on main (`98cf4e0`; SQL `b7b8473`). Guarded txn, verified; backups `backup.managed_lists_pre_vocab_20260728` / `backup.managed_list_items_pre_vocab_20260728`. **Follow-on still pending → see #2 below:** the `units.category_id`/`type_id` column DROP (owned by #2/jolly) is not yet done.
- **2026-07-27 (#14) — `measure_definitions.description` column DROPPED** — code on main (`4316624`, direct commit, **no PR** — see hygiene watch) + DB column dropped on dev (guarded txn, verified gone); backup `backup.measure_definitions_description_20260727` (9 rows).
- **2026-07-27 (#14) — "All" sentinel chain DELETED** (guarded txn; real data re-homed by Eugene first; each row verified 0 inbound refs at delete time). Removed: `service_areas` 89 "All Service Areas", `organisations` 1 "All Utilities", `countries` 100000 "All Countries", `sub_regions` 10000 "All" / 1 "All SubRegions" / 5 "Others". Backups: `backup.sentinel_service_areas_20260727` / `_organisations_20260727` / `_countries_20260727` / `_sub_regions_20260727`. Aligns with #8's no-sentinel hybrid ruling. Endorsed by #8 + #13. ⚠ **Open confirmation:** #2/#10 asked to verify no Silver/gold **view** or **entitlement** key references the removed rows (see pending-confirmations below).
- **2026-07-27 (#14):** `countries` name corrections to UN M49 canonical forms — 583→"Micronesia (Federated States of)", 612→"Pitcairn", 876→"Wallis and Futuna Islands". Name-only (ids unchanged/M49-correct), FK-safe, guarded txn; backup `backup.countries_names_20260727`.
- **2026-07-27 (#14):** American Samoa `id 1→16` (M49 re-key of the last serial-id singleton).
- **2026-07-27 (#12):** admin MFA migration (`user.two_factor_enabled`, `session.two_factor_verified_at`, `two_factor` table) applied to the `.env` DB — additive/idempotent, **do not re-run** `scripts/apply-mfa-migration.ts`.
- **2026-07-27 (#4/#14):** energy-dim column physicalisation (PR #68) applied — `provider_id`/`category_id`/`technology_id`/`asset_id`/`unit_id`, table `units`, views rebuilt, `formula_inputs` JSON keys renamed 67 rows; backups `backup.*_20260727`.
- **2026-07-27 (#13):** M49-as-PK dedupe on `countries`/`sub_regions` + dropped id sequences + ISO-4217 currency seed (PRs #60/#61/#62/#64/#65). Applied.

**Open confirmations (post-change verification owed):** — ✅ **all cleared 2026-07-27.**
- ~~**#2:** no Silver/gold view keys off the deleted "All" sentinel rows.~~ **✅ CLEARED** — jolly-murdock (author of the #68 silver/gold views) scanned all 11 live views/matviews via `pg_get_viewdef`; none keys off org 1 / country 100000 / sub_region 10000·1·5 / service_area 89 (only false-positive was `status_id >= 5`, an approval threshold). Views join by FK, so deleted rows just stop appearing. (Formal view-layer owner is #4/#2; jolly authored the 2 core views + scanned the full set — flag if #4 wants to co-sign.)
- ~~**#10:** no entitlement/access key references those deleted sentinel rows.~~ **✅ CLEARED** — spec grep-clean; #10 has no built runtime access code (design-only); picker/`ensureCountry` key off real M49 codes only, structurally excluding the non-M49 "All Countries" (100000).

---

## 2b. USER-IMPACT ledger audit (#15 duty — added 2026-07-28)

Per [`USER-IMPACT.md`](USER-IMPACT.md) (new protocol, `5c2959e`, Eugene-directed): journey-affecting changes must add a ledger row **in the same commit**; **#15 audits** each merged journey-affecting change against a row — a landed change with no row is a gap. Instruction-writing owner is **#11**.

**Pass 2 (2026-07-28) — ledger now has 13 rows. Findings:**
- ✅ **GAP CLOSED — `external_registrations` retirement (#10, PR #79).** #10 authored the remediation row; #15 inserted it as **row 13** (BMO/org-admin/registrant: approve via Pending Users screen, old console gone).
- ✅ **My pass-1 miscall corrected:** I'd filed the `measure_definitions.description` drop and `units.is_aggregated` drop as "internal-only." **Wrong** — both removed a **settings form field** (Description textarea; "Is Aggregated Resource" checkbox), so both are journey-affecting. #14 caught it and added **rows 11 & 12**. Lesson: a *column* drop can still be a *journey* change if a form field sat on it — check the settings surfaces, not just the schema.
- ✅ **CANDIDATE RESOLVED — 10 legacy managed_lists DELETED (#2, 2026-08-03).** #2 confirmed they WERE surfaced (Settings → Managed Lists renders all lists unfiltered) → journey-affecting; #2 authored the content, #15 added **row 15**. All 10 were vestigial (0 live data), so impact = "unused clutter removed from an admin picker," not a workflow loss.
- ✅ **CANDIDATE RESOLVED — managed-lists vocab rename (#4).** #4 confirmed it's journey-affecting (same logic as the "Grid" label row) and authored **row 14** (BMO sees Strata/Provider/Category/Technology/Asset Class/Unit in managed lists).
- ✅ **Covered:** MFA (r1), "Grid" label (r2), sentinel deletion (r3), API-key tiering (r4), BSC "+Add KPI" picker (r8), trajectory removal (r9), Description drop (r11), is_aggregated drop (r12), external_registrations (r13), vocab rename (r14).
- 🕐 **Forward obligations (correctly rowed, not yet built):** registration quiz (r5), grain data-entry (r6), unit lifecycle (r7), calculator builder (r10).
- ⚙ **Confirmed internal-only (no row):** `asset_class_id`/`strata_id` column renames, `units.category_id`/`type_id` drops, and `energy_resource_type_relevance → asset_class_relevance` table+code rename (`17a786d`, per #4) — no user-facing surface.

## 3. Awaiting Eugene (decisions that unblock merges)

| Stream | Decision needed | Blocks |
|--------|-----------------|--------|
| #2 | provide the real **sample data extract** | the medallion data reload (last step of the migration) |
| #10 | **default-plan contents** + **member entitlements** (the free `member` plan's sector-scoped dashboard set; `member` is now association-agnostic — PPA→electricity, PWWA→water/sanitation) | tiered-access schema (no code until settled) |
| #4 | load **real country-context history** via `scripts/seed-country-context.ts` | populated country-context data (post the 2026-08-23 repoint) |
| #8/#4 | **subgroup-221 disposition** — prepped by #8, awaiting a fact from #4 then Eugene's call | resolving that subgroup |
| #? | **3 null `financial_year_end`** values — data fix (which FY-end for the 3 orgs) | per-utility FY period bucketing for those orgs |
| — | review/merge the **4 human PRs** (#104, #83, #77, #76) + **16 Dependabot** individually — not a blocker | PR backlog / dependency currency |

*Cleared since refresh 1:* **#8** schema-convention (Eugene ruled hybrid freeze-as-built, `7c01627`). **#12 D1** — RLS tenant column decided (`utility_id`); #12 writes the policy DDL (handles `utility_id IS NULL` shared rows). **#12 D2** — API_KEY split now in PR #73 (no longer a decision). **Dependabot triage** — safe subset merged (#37/#41/#72), 10 majors held per Eugene's individual-review call.

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

> **⚠ Lesson (2026-08-05):** ping-driven incremental updates keep the DB-change/journey-audit sections fresh but **silently miss new PRs/branches nobody pinged about** — the open-PR count drifted from a real 21 down to a stale "10." **Every refresh MUST re-run the full `gh pr list` + branch-ahead scan (§4)**, not just fold in pings. Pings are additive, not a substitute for the scan.

---

*Maintenance: #15 refreshes §1 on each sync and reconciles §2–§3 against `WORKSTREAMS.md`. Other streams: when you commit/push/merge/apply-DB, it will show up here on the next refresh — you don't need to edit this file, but a one-line ping to #15 (or a board update) keeps §2–§3 tight.*
