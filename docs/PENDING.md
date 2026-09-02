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
- **Open PRs (2026-08-31c): 1 human** — `#179` (#2 new-org onboarding step, mergeable/ready). `#198` (retire `is_aggregated`) **merged @14:52** + column dropped on dev; #77 & #104 also merged. Dependabot in active flux (Eugene's engineer working them).
- **Cleared this session:** #8 schema-convention ruling (`7c01627`); #12 D2 API_KEY split merged (`167f080`); both sentinel-deletion confirmations (#2 views, #10 access); safe Dependabot subset merged.
- **Awaiting Eugene — 2:** **#2 imminent full-migration run (later today)** — Eugene's data inputs: **tariff (Standard/Lifeline) + 340/342 downtime-events** extracts, one run, **+ new-org onboarding workbook if the run adds new utilities** (step built PR #179; skip if none). ⚠ the general medallion reload is ✅ DONE (PR #107). **FYE for 3 placeholder utilities** (Vanuatu/Pitcairn/NZ — forward pre-req, no live impact; FYE *column mechanism* landed #159/#162, values still owed). *(#10 ✅ RULED; #4 country-context ✅ DONE; #2 consolidation ✅ COMPLETE — Stage 2 dropped via Eugene's backup+drop, #266.)*
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

### Open PRs (re-scan 2026-08-31b)
> Method: full `gh pr list --state open` each refresh (pings are additive, not a substitute — see the Lesson in §4).

**1 human PR open:**
- `#179` [#2] **new-organisation onboarding step (`--new-orgs`)** — migration "step 0": onboard new orgs / service_areas / report_periods before the data-entries load. Mergeable, not draft. **Should merge before the imminent migration run** if that run adds new utilities (git-first: code on main before any new-org DB inserts).

*(Cleared: `#198` retire `is_aggregated` **MERGED @14:52** + dev drop [dup of `is_calculated`; `is_context_fed` KEPT — not a dup]; `#77` Access Plans prototype **merged** [was parked; landed]; `#104` merged; earlier nudge cleared #113/#76/#83.)*

**Dependabot PRs — ⚠ IN ACTIVE FLUX (2026-08-31): Eugene's engineer is merging/updating them directly**, so the count is changing minute-to-minute (was 12, dropping) — **not pinning a number here.** Vuln posture unchanged (triage complete/accepted, nothing prod-reachable — see note below). Re-scan for the live list rather than trusting a recorded count.
> **Vuln alerts (2026-09-01, #12-triaged): 7 open, none production-reachable.**
> - **4 × `brace-expansion`** (2 high, 1 med, 1 low) — accepted-residual/non-reachable. **Fix planned:** pin the override `2.0.1`→`2.1.4` (it's `>=2.0.1`, so a fresh install resolves the patch but the lockfile still has an old one — pin + `npm install`). **Folded into the engineer's in-flight dep work (#190–192)**; if not, #12 opens a small override-bump PR *after* those land (avoid lockfile conflicts). Clears all 4.
> - **3 × `hono`** (2 med, 1 low) — ✅ **ACCEPTED, no fix (dev-scope, zero prod exposure):** #12 verified `npm ls hono --omit=dev` = 0 — hono is transitive under `shadcn` (devDep) → MCP sdk → `@hono/node-server`; PRISM runs no hono server, so the SSR-retention / lang-middleware-DoS / proxy-header advisories are unreachable.
> *(History: spiked 4→24 on 2026-08-24, cut to single digits by #12's PR #119.)*

⚠ **main's deps changed again (#119: `package.json`+lock) → run `npm install` after your next pull.**

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
| 2 | Medallion migration | **data_entries reload ✅ DONE** (Load #15/PR #107, 20,407 shells, variance→0). Remaining: **tariff + 340/342 downtime** migration (one imminent run today, awaits Eugene's extracts) + **new-org onboarding "step 0" ✅ BUILT** (PR #179, 3-sheet Excel; awaits Eugene to author the workbook *if* the run has new utilities, else skip) + context-fed pass parts 3–4 | — (schema changes already on the `.env` DB; no separate prod apply) | ⏳ Eugene **tariff+340/342 extracts** (+ new-org workbook if any) | 🟢 active |
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

**Net pending right now** (genuinely open items only):
- **Human PRs: 1 open** — `#179` (#2 new-org onboarding step, ready — merge before the run if it adds new utilities). *(#198 retire `is_aggregated` merged @14:52 + dev drop; #77 & #104 merged.)* Dependabot in active flux (Eugene's engineer working them).
- **Awaiting Eugene (2):** **#2 imminent full-migration run today** (tariff + 340/342 + new-org workbook if new utilities) · FYE for 3 placeholder utilities (forward). *(#2 consolidation ✅ COMPLETE — Stage 2 done #266.)*
- **In-flight / owed:** #2 context-fed pass parts 3–4 (non-blocking) · #12 P2/D2 operator steps (env/Power BI/rotate) · #11 country-context form (USER-IMPACT r16) · a branch-triage pass over the ~15 un-PR'd `claude/*` branches.
- **#2 utility-context/governance consolidation ✅ COMPLETE** (Stages 1–4: #241/#266[`d87a202`]/#257/#251 + org rationalisation #247 + bm_participates #250; all applied+verified on p2). **Forward-only (no-op today):** the Stage 3 "2026 activation" set — fires when the first FY2026 service-area Feeder-Type data lands (#3 `measureMeta→effective_strata_id` + loader §1.6 + run the fiscal-year parity test on the p2 checklist). (Stage 2's live-org-settings journey change — 3 context fields removed — captured in USER-IMPACT **row 20**, #11 PR #272.)
- **~~Prod apply debt~~ — NONE.** p2 is a single `.env` DB (= future prod); dev-applied SQL is already on prod-to-be. The former "cutover runbook" is now just a **rebuild/replay log** (§ below), not pending work. *(Eugene ruling 2026-09-01, [[prism-single-p2-instance]].)*
- **Deferred (nothing to queue today):** the unified relevance surface (`docs/measure-relevance-spec.md`) rides #2's ONE combined temporal-spans reimport migration (+ unit-activation stints, `btree_gist`).

> *Settled design decisions (431 mode, relevance cluster, etc.) are recorded in the spec and are NOT tracked here — this list is open items only.*

`npm install` after pull.

**Doc-debt (flagged by #8):** #2's medallion spec (`schema-redesign-medallion.md` §1.4/§1.5) still describes "All areas" NOT-NULL grain targets, now **contradicted** by the hybrid ruling. #2 asked to amend; tracked here until they do.

### Recently applied DB changes (done — do NOT re-run; informational)
> **📌 POLICY (Eugene via #1, effective 2026-08-31, no exceptions): git FIRST, then DB.** Code/migration must be **committed AND pushed** (ideally merged to main via PR) **before** any DDL/DML is applied to a real DB (dev or prod). Order is always (1) git, then (2) apply. Keeps the DB from drifting ahead of code. Being added to durable project instructions. *(Historically some entries below were applied ahead of their PR; that pattern is now disallowed going forward.)*

DML/DDL applied to the single `.env` DB (= future prod; no separate cutover apply — see the ruling below). Recorded so no session re-runs them and everyone knows the DB state:
- **2026-09-01 (#2) — org/user rationalisation** (PR #247, applied to p2; Eugene-directed cleanse; backups taken): `organisations` **54→44** — deleted 10 empty person-rows, renamed 12 person-rows → institutions, reassigned 9 users (`organisation_id` only). Vanuatu(46) + NPC(17) kept; NPC now `bm_participates=true`. Data cleanse of junk rows → **no USER-IMPACT row** (per #2; the journey change in this program is Stage 2, not this).
- **2026-09-01 (#2) — dead legacy tables `utility_context_data` + `governance_data` DROPPED** (PR #241 `df48cf0`, applied to p2): both 0 rows, pre-medallion; orphaned settings pages/routes removed too. **Stage 1** of the utility-context/governance consolidation (see net-pending). Dead/orphaned → **no USER-IMPACT row**.
- **2026-09-01 (#2/#3) — `measure_definitions.is_kpi` + `is_kpi_input` columns DROPPED** (PR #211, applied to `.env` DB, backup taken): Eugene-directed; #3 verified drop-safe (computed measures as KPI inputs still compute via the reactive path). `kpi_definitions.is_kpi_input` untouched. Effect: formula-builder picker now offers all active measures. Picker not a live surface yet (calculator builder DEV-gated, r10) → **no USER-IMPACT row**. *(The related "Compute now refreshes computed-measure inputs first" hardening — #3 already landed it, PR #216; not parked.)*
- **2026-09-01 (#2) — `country_context.source_date` timestamp→date** (PR #208 `ee395fd`, applied): provenance date; time was meaningless artifacts → dropped, lossless, 1009 rows intact, backup taken. `updated_date` left as timestamp. Script `scripts/sql/2026-09-01-country-context-source-date-to-date.sql`. Internal provenance column → no USER-IMPACT row.
- **2026-08-31 (#2/#3) — `measure_definitions.is_aggregated` column DROPPED** (PR #198, merged 14:52 + dev drop): duplicate of `is_calculated` (both mean "computed → excluded from manual entry"); the split caused a calc-measure compute bug. **`is_calculated` still governs the exclusion, so behaviour is unchanged** → **no USER-IMPACT row** (redundant flag removed, not a distinct field — unlike `units.is_aggregated` r12). Note: `is_context_fed` was KEPT (not a dup). git-first order honoured (PR merged, then drop).
- **2026-08-31 (#2) — measure_definitions 13/14 renamed** (PR #196, applied to dev): → "IATA Air Connectivity per 1000 People" / "IATA Air Connectivity per Unit GDP". Coordinated code shipped same PR (fact route + 2 name-matching mapping scripts). Name correction only → **no USER-IMPACT row** (cf. country-name / Ancillary spelling fixes). Applied to the `.env` DB.
- **2026-08-31 (#2) — FYE cleanup fully landed** (PRs #159/#162): `report_periods.report_date` aligned to the canonical `fye_month`/`fye_day`; **text `financial_year_end` column DROPPED** (superseded by fye_month/day). Closes the FYE-column mechanism (the 3-placeholder-utilities item is separate — it's about *values*, still owed). Not Awaiting-Eugene.
- **2026-08-26 (#3) — `formula_binding` + `formula_binding_dimension` tables added** (PR #135, applied to dev): durable 10-dim binding store behind the new unified KPI/calculated-measure formula builder (additive — new tab, legacy builders untouched). Applied to the `.env` DB via `scripts/sql/2026-08-26-formula-binding.sql` (raw SQL; see rebuild log).
- **2026-08-26 (#4) — `kpi_actual` shared table added** (`scripts/sql/2026-08-26-kpi-actual.sql`, applied to dev): ratified computed-KPI store (#8 grain + #3 write-path, `docs/kpi-actual-ddl-design.md`), early-landed for Eugene's calculator push. Additive/idempotent-guarded. Deferrals: `period_id` bare int (FK later), `owning_org_id` present but RLS policy not yet applied.
- **2026-08-26 (#4) — Network Downtime Events 340/342 REACTIVATED** (`310584e`, is_active=true; Eugene reversal relayed via #2). Equipment events 330/332 + transmission 440 stay off (440 reactivates on sponsor demand). The 2026-08-25 deactivate script was edited to 330/332/440-only; new reactivate script added (runbook 5/5a).
- **2026-08-25 (#4) — shell-audit + relevance-generator batch** (all on `main`, applied to the `.env` DB; scripts in the rebuild log below). Resolved end-state: the committed `verify-relevance` tool is **fully green on dev**. Changes: `measure_definitions.effective_from` date col added (`4eaac1e`; 111 @ 2020-01-01, then 9 @ 2026 after the `a10029a` correction); downtime EVENTS + transmission measures deactivated (`a10029a`/`8ff154a` — is_active=false on 330/332/340/342/440; ADR 0004 amended); Hours Worked 290/291/292 relevance reconciled (`87fea19` — +Ancillary Services 1030 applicability, source scope by_context); managed-list 1030 spelling fix "Ancilliary"→"Ancillary Services" (`f30d85a`, user-facing member, 0 code refs); backfilled 154 calc-measure shells for 230/231 (`a5c3154`); soft-deleted 195 hydro/wind Lubrication-Oil shells (`c924024`, is_deleted, reversible, ruling: lube oil = thermal-only) + 24 IPP consumable shells (`2c00d56`). Also 2 code-only tools (no DB): `verify-relevance` invariant checker (`23d76ef`) + generative expected-set half (`ecdb545`) → the recommended **post-rebuild verify gate**. All SQL applied to the single `.env` DB (in the rebuild log).
- **2026-08-25 (#4) — `country_context` DATA loaded on dev** via `scripts/seed-country-context.ts`: **1040 rows** (16 countries × 16 measures, 2020–2025), flush-and-reload of Eugene's real extract; 0 dups, FK-clean, real values. Data (not schema). Applied to the single `.env` DB (in the rebuild log). Clears the "#4 country-context history" Awaiting-Eugene item.
- **2026-08-24 (#4) — `country_context.no_data_reason` added** (`024d935`, applied to dev): `varchar(32)`, null | `'not_available'`, + two CHECKs (vocab; value-XOR-reason). Mirrors the `data_entries` availability axis; part of the country-context migration path (Eugene's real load). Script `scripts/sql/2026-08-24-country-context-no-data-reason.sql` (idempotent; applied to the `.env` DB). Internal (no journey surface *itself*) → forward follow-up folded into USER-IMPACT **row 16** (#11 adds a "not available" option to the BMO form).
- **2026-08-24 (#4) — `measure_definitions.is_context_fed` flag added** (`8d80cc6`, applied to dev): boolean NOT NULL DEFAULT false; all **16 subgroup-221 "Country Context" measures flagged true** — implements Eugene's context-fed disposition ruling; #2 keys their shell-exclusion gate on it. Script `scripts/sql/2026-08-24-measure-is-context-fed.sql` (idempotent; applied to the `.env` DB). Internal catalogue flag → no USER-IMPACT row (per #4).
- **2026-08-24 (#4) — FY-end-aware fiscal-year derivation** (`6504e7e`, **code-only, no DB**): ReportPeriod labels now derived from each org's `financial_year_end` (fixes calendar-year utilities); **~30 report periods relabel** across all 24 fact routes' Power BI exports. Journey-affecting → USER-IMPACT **row 17** (analysts/BMO see corrected FY labels).
- **2026-08-23 (#4) — country-context repoint (Option 2)** (code merged `fcf8e4e`): `country_context` FK repointed `managed_list_items → measure_definitions`; `dl_def_id → measure_def_id` rename. Script `scripts/sql/2026-08-23-country-context-repoint-measure-def.sql` (applied to the `.env` DB). Follow-ups: #11 metric-field select+upsert (USER-IMPACT **row 16**, 🕐); #4 load real history (Awaiting Eugene).
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

### 🗂️ Applied-SQL log / rebuild sequence (all already applied to the `.env` DB)
> **📌 No "prod cutover apply" step exists.** Per Eugene's 2026-09-01 ruling ([[prism-single-p2-instance]]): **p2 runs on a SINGLE database — the `.env` DB — which IS future prod** (launch = repoint URLs to it). A change applied to `.env` is applied to prod; there is **no second per-env run.** Prior "PROD apply pending" items were spurious and are retired. This list is now a **rebuild/replay record** (the order to re-run these idempotent scripts + seed + verifier *if the DB is ever reset*) and a git-first audit trail — **not pending work.** All are already live on the one DB:
1. `scripts/sql/2026-08-23-country-context-repoint-measure-def.sql` (#4) — country_context FK repoint + `dl_def_id→measure_def_id`
2. `scripts/sql/2026-08-24-measure-is-context-fed.sql` (#4) — `is_context_fed` col + flag the 16
3. `scripts/sql/2026-08-24-country-context-no-data-reason.sql` (#4) — `no_data_reason` axis + CHECKs
4. `scripts/sql/2026-08-25-measure-effective-from.sql` (#4) — `effective_from` col + dates
5. `scripts/sql/2026-08-25-deactivate-downtime-events.sql` (#4) — **EDITED 2026-08-26**: now is_active=false on **330/332/440 ONLY** (340/342 removed)
5a. `scripts/sql/2026-08-26-reactivate-network-downtime-events.sql` (#4) — is_active=true on **340/342** (Eugene reversal). ⚠ **ordering: must run BEFORE #2's 340/342 data load** (verify-relevance gates shells on is_active)
6. `scripts/sql/2026-08-25-hours-worked-scope-reconcile.sql` (#4) — Hours Worked 290/291/292 applicability+scope
7. `scripts/sql/2026-08-25-fix-ancillary-spelling.sql` (#4) — managed_list_items 1030 spelling
8. `scripts/sql/2026-08-25-backfill-calc-shells.sql` (#4) — 154 calc shells for 230/231
9. `scripts/sql/2026-08-25-remove-hydro-wind-lube-oil-shells.sql` (#4) — soft-delete 195 lube-oil shells
10. `scripts/sql/2026-08-25-remove-ipp-consumable-shells.sql` (#4) — soft-delete 24 IPP consumable shells
11. `scripts/sql/2026-08-26-kpi-actual.sql` (#4) — **new shared table `kpi_actual`** (ratified computed-KPI store, #8 grain + #3 write-path; `docs/kpi-actual-ddl-design.md`). Additive/idempotent-guarded. ⚠ **2 deferrals:** (a) `period_id` is a bare integer — **add FK when the canonical `period` dimension lands**; (b) `owning_org_id` column present but **#12's RLS policy not yet applied**.
12. `scripts/sql/2026-08-26-formula-binding.sql` (#3, PR #135) — **`formula_binding` + `formula_binding_dimension`** tables (durable 10-dim binding store for the unified builder). Idempotent `CREATE TABLE IF NOT EXISTS`, additive. **Apply via raw SQL execution against prod (NOT `drizzle-kit push`)** — `db/schema/formulaBinding.ts` is app-side types only; this SQL is the DDL authority (same pattern as step 11's `kpi-actual.sql`).
12a. `scripts/sql/2026-08-30-financial-validation-bounds.sql` (#3, PR #150) — 2 catalogue UPDATEs: `valid_range_min` NULL on 226/231; `valid_range_max` NULL on 34 currency amounts. Feeds the live data-entry form's entry+save validation. Post-apply verify.
12b. `scripts/sql/2026-08-30-migration-approval-model-a.sql` (#2, PR #157) — ⚠ **CONDITIONAL, one-time:** Migration Model A (Eugene+#8) — shells of CEO-approved periods → Approved(5); 154 empties → not_available. **Run ONLY if prod was loaded by the OLD loader (before PR #157).** The durable fix lives in the loader itself (`reconcileApprovalModelA`, PR #157), so a fresh prod flush-and-reload produces Model-A directly and **skips this script.** Applied+verified on dev (20,575 shells all Approved).
12c. `scripts/sql/2026-08-30-report-period-status-check.sql` (#4) — CHECK `chk_rp_status_lifecycle` bounding `report_periods.status_id` to {2,3,4,5} (excludes retired 1/6, shell-only 7). Applied+verified on dev 2026-08-30. **Companion code** (main `c9ae238`): 25 fact/dim Power BI routes now gate on `= Approved(5)` instead of `isNotNull(status_id)` — **ships with the code, no separate prod step.** Fixes a latent publish leak from the 2026-08-18 status_id enum repoint. Zero live impact today (all 147 periods = Approved).
12d. `scripts/sql/2026-08-30-organisation-fye-columns.sql` (#4, `edaebfa`) — additive: `organisations.fye_month` + `fye_day` (nullable smallint) + CHECKs (month 1–12, day 1–31). **Canonical per-utility FYE, supersedes text `financial_year_end`** (#2 retires the text col later). Applied+verified on dev. *(This is the mechanism for the "FYE for 3 placeholder utilities" Awaiting-Eugene item — Vanuatu/Pitcairn/NZ get their FYE set via these columns.)*
12e. `scripts/sql/2026-08-31-fix-cost-breakdown-group.sql` (#3, PR #177) — catalogue DML: re-file 3 Cost Breakdown measures (145/148/149) from stray `group_id=230` → `202` (Financial) so they appear in the formula-builder measure picker. Taxonomy/picker-visibility only; picker isn't a live BMO surface yet (calculator builder DEV-gated, USER-IMPACT r10) → **no journey row**. Applied to dev.
13. **Seed:** `scripts/seed-country-context.ts` — 1040 country-context rows (Eugene's extract)
14. **GATE:** `node --env-file=.env --import tsx scripts/verify-relevance.ts` — read-only invariant + generative check; **exits 1 on violation.** Run AFTER 1–13; currently all-green on dev.
15. **GATE (pre-reimport, #8):** `test/integration/fiscal-year-parity.integration.test.ts` — asserts the TS FY helper ≡ the `fiscal_year_for_report_period` SQL fn across all 140 periods. **⚠ DB-guarded (`skipIf` no `DATABASE_URL`) — it SKIPS in CI / no-DB, so it protects nothing unless run against p2.** #8's standing note: run it against p2 on the pre-reimport verification checklist, not just in the repo.
> Also in the rebuild sequence: MFA `scripts/sql/2026-07-26-admin-mfa.sql` (S-series; already on the `.env` DB). And `2026-09-01-country-context-source-date-to-date.sql` (#2, PR #208 — `source_date` timestamp→date, applied). Keep this list current as new SQL lands — it's the replay record, not a to-do.
> **Forward (not queued yet):** #2's **ONE combined temporal-spans reimport migration** will carry both the `service_area_capabilities` span table (#4, ratified `2f5c357`) **and** unit-activation stints (`btree_gist`) + their seed-spans — expect a *single* migration run for both when that migration is authored, not two.

---

## 2b. USER-IMPACT ledger audit (#15 duty — added 2026-07-28)

Per [`USER-IMPACT.md`](USER-IMPACT.md) (new protocol, `5c2959e`, Eugene-directed): journey-affecting changes must add a ledger row **in the same commit**; **#15 audits** each merged journey-affecting change against a row — a landed change with no row is a gap. Instruction-writing owner is **#11**.

**Pass 2 (2026-07-28) — ledger now has 13 rows. Findings:**
- ✅ **GAP CLOSED — `external_registrations` retirement (#10, PR #79).** #10 authored the remediation row; #15 inserted it as **row 13** (BMO/org-admin/registrant: approve via Pending Users screen, old console gone).
- ✅ **My pass-1 miscall corrected:** I'd filed the `measure_definitions.description` drop and `units.is_aggregated` drop as "internal-only." **Wrong** — both removed a **settings form field** (Description textarea; "Is Aggregated Resource" checkbox), so both are journey-affecting. #14 caught it and added **rows 11 & 12**. Lesson: a *column* drop can still be a *journey* change if a form field sat on it — check the settings surfaces, not just the schema.
- ✅ **CANDIDATE RESOLVED — 10 legacy managed_lists DELETED (#2, 2026-08-03).** #2 confirmed they WERE surfaced (Settings → Managed Lists renders all lists unfiltered) → journey-affecting; #2 authored the content, #15 added **row 15**. All 10 were vestigial (0 live data), so impact = "unused clutter removed from an admin picker," not a workflow loss.
- ✅ **CANDIDATE RESOLVED — managed-lists vocab rename (#4).** #4 confirmed it's journey-affecting (same logic as the "Grid" label row) and authored **row 14** (BMO sees Strata/Provider/Category/Technology/Asset Class/Unit in managed lists).
- ✅ **Covered:** MFA (r1), "Grid" label (r2), sentinel deletion (r3), API-key tiering (r4), BSC "+Add KPI" picker (r8), trajectory removal (r9), Description drop (r11), is_aggregated drop (r12), external_registrations (r13), vocab rename (r14), managed-lists deletion (r15), FY-aware ReportPeriod labels (r17, #4 `6504e7e`), data-entry validation live + financial sign/range conventions (r18), **org-settings 3 context fields removed (r20, #11 PR #272)**. *(Ledger now 20 rows; no gaps.)*
- 🕐 **Forward obligations (correctly rowed, not yet built):** registration quiz (r5), grain data-entry (r6), unit lifecycle (r7), calculator builder (r10), country-context metric select+upsert (r16, #11), **publish-gating by approval status (r19 — gate shipped, trigger = #2 period-creation; per #4)**. *(Ledger now 19 rows.)*
- ⚙ **Confirmed internal-only (no row):** `asset_class_id`/`strata_id` column renames, `units.category_id`/`type_id` drops, `energy_resource_type_relevance → asset_class_relevance` table+code rename (`17a786d`), `measure_definitions.is_context_fed` flag (`8d80cc6`, per #4), `country_context.no_data_reason` (`024d935` — surfacing folded into r16), and Cost-Breakdown measures 145/148/149 re-filed `group_id 230→202` (#3 PR #177 — picker not a live surface yet, r10) — no user-facing surface from the schema/taxonomy change alone.

## 3. Awaiting Eugene (decisions that unblock merges)

| Stream | Decision needed | Blocks |
|--------|-----------------|--------|
| #2 | **data inputs for one imminent full-migration run (today):** **tariff (Standard/Lifeline)** + **340/342 downtime-events** extracts — the general medallion reload is ✅ DONE (PR #107), these are the remaining slices | the tariff + downtime-events migration pass |
| #2 | **new-org onboarding workbook** — format ✅ decided (3-sheet Excel: organisations / service_areas / report_periods) + step ✅ BUILT (PR #179, idempotent, aborts-before-truncate, FY report_date auto-derived from fye_month/day). Remaining: Eugene **authors the workbook IF the run adds new utilities**, else skip (no-op) | new-utility onboarding in the run |
| ~~#10~~ | ✅ **RULED 2026-08-31 (Eugene):** **Default plan** = points to **Power BI's homepage** — a **placeholder**, DEV updates the specific PBI-homepage name/URL once it's built. **Member entitlements** = **electricity-only for now** (exclude non-electricity sectors); **PPA membership-type entitlements already provided** (use those). ⚠ **Correction: there is NO free `member` plan** — the earlier "free member plan" framing was wrong. → relayed to #10; unblocks their build. | *(cleared)* |
| BMO/Eugene | **Set `financial_year_end` for 3 placeholder utilities** — **Vanuatu (46)**, **Pitcairn (51)**, **New Zealand (52)** — *before* they onboard any Financial-Year data. Forward-looking, **no live impact today** (all 3 carry 0 report periods; the other 10 null-FYE orgs are stray test rows). Without an FYE, FY-placement silently falls back to `report_date`-as-FY-end and mislabels their fiscal year (#2, verified 2026-08-28). Owner = whoever onboards them. | correct FY labelling if/when those 3 submit FY data |
| #2/#4 | **PNG Power (util 20) missing Lubrication-Oil shells for its Natural Gas units** — verifier-surfaced candidate; assess add-or-exclude | shell-audit completeness for util 20 |
| #4 | 🅿️ **CUC fuel pass-through disposition** — 2 soft-deleted Fuel Oil @ IPP values (Commonwealth Utilities Corp diesel: FY22 28,418,920.78 + FY23 28,559,079.00), preserved. **Eugene: "leave as-is for now"** — low-urgency, awaiting ruling on whether they're genuine fuel pass-through | reactivating or purging those 2 values |
| — | **Dependabot** — being actively merged/updated by Eugene's engineer (2026-08-31); not a blocker | dependency currency |

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

> **⚠ Rule (2026-09-01, CLAUDE.md via #1): verify against `origin`, never the local checkout.** The shared tree is routinely on another session's branch / dirty / stale, so local `main`/`HEAD`/working-tree LIE about repo state (root of the false "divergence" alarms). Always `git fetch origin` first, then compare **only vs `origin/main`** — `git merge-base --is-ancestor <sha> origin/main` for "is X in?", **never `git log origin/main..main`** (reads stale local main). Canonical tool: **`scripts/repo-truth.sh`** (fetches, reports strictly vs origin/main; supports `<commit>` membership + `--file PATH`). This is why #15 edits via throwaway worktrees off `origin/main`, not the shared checkout.
> **⚠ Worktree safety (after the 2026-09-01 #213 mass-wipe → #215 revert, net-zero):** always `git worktree add <path> origin/main` with a **FULL checkout** — **NEVER `--no-checkout` / partial-stage**, which records a tree of only the staged file(s) = everything else deleted (the #213 root cause). A `.git/hooks` pre-commit guard now **blocks any commit deleting ≥30% of the tree** (override: `--no-verify`). Before merging any PR, sanity-check scope with `gh pr diff --stat` — a "docs" PR must touch a handful of files, never hundreds. (#15's single-file docs PRs are the safe pattern.)

> **⚠ Standing rule (2026-08-30): contested async facts anchor to the authoritative DOCUMENT TEXT at `main` HEAD — not messages, and not even commit subjects.** When a fact flip-flops across crossed cross-session messages, record what the **file content at HEAD** actually says and cite the spec section — a commit *subject* can contradict the file it commits (seen in practice), and the file content wins. If the repo itself carries contradictory "FINAL/LOCKED" declarations, that's an **unresolved inter-stream dispute** — record the HEAD text, note the conflict, and **surface it to Eugene** rather than flipping the tracker with each ping. Reopen only via a synchronous edit to the authoritative doc, never a queued message.

---

*Maintenance: #15 refreshes §1 on each sync and reconciles §2–§3 against `WORKSTREAMS.md`. Other streams: when you commit/push/merge/apply-DB, it will show up here on the next refresh — you don't need to edit this file, but a one-line ping to #15 (or a board update) keeps §2–§3 tight.*
