# PRISM 2 — Workstreams Board

**Single source of truth for what every PRISM session is doing and its status.**
This file is read and written by multiple concurrent Claude Code sessions (the "PRISM 2" sidebar group). It exists because grouping sessions in the sidebar does **not** make them aware of each other — this file does.

> **Absolute path (use this, not a relative link — sessions run from different folders incl. worktrees):**
> `C:\Users\eugen\prism\docs\WORKSTREAMS.md`

---

## Protocol for every session

1. **On start:** read this file top-to-bottom before doing anything.
2. **When your status changes** (start/pause/block/finish a chunk, or hit/clear a dependency): update *your own row* — status emoji, the `Last update` date, and one line on what changed.
3. **Editing etiquette:** only edit your own stream's section (+ this shared area if a dependency between streams changes). Keep entries terse — this is a dashboard, not a log.
4. **Dates are absolute** (YYYY-MM-DD). Today when seeded: 2026-07-24.
5. If you pick up a stream that has no owning session yet, put your session name in `Owner`.

## Legend

🟢 active · 🟡 blocked (waiting on another stream) · ⏸️ paused (waiting on Eugene / external) · ✅ done · ⚪ not started

---

## Status at a glance

| # | Stream | Session name | Status | Blocked by / Blocks |
|---|--------|--------------|--------|---------------------|
| 1 | Project management / coordination | PRISM 2 project mgt | 🟢 | owns this board |
| 2 | Medallion migration | PRISM 2 migration | ⏸️ | **blocks** #3, #7, #8 |
| 3 | Calculator engine | PRISM 2 calculator | 🟢 | needs typed entries from #2 (mockable) |
| 4 | Schema for AI | PRISM 2 schema for AI | ⚪ | likely needs #2 stable |
| 5 | BSC Builder | PRISM 2 BSC | 🟢 | — |
| 6 | BSC strategy map | PRISM 2 BSC strategy map | ✅ | built on #5; merged to main |
| 7 | KPI calculator (multi-…) | PRISM 2 KPI calculator | ⚪ | likely needs #3 |
| 8 | Multi-level data hierarchy | PRISM multi-level data hier | 🟢 | must reconcile with #2 — both redesign `data_entries` |
| 9 | BSC Builder specification | BSC Builder specification | 🟢 | feeds #5 |
| 10 | Tiered access / tenancy | PRISM 2 tiered access | ⏸️ | new — touches org/user/auth (§ overlaps #8 org model); paused on Eugene (default-plan + PPA-member entitlements) |

> ⚠️ Rows 4, 7 are seeded from the session names only — the **owning session must confirm status, real scope, and dependencies** and correct anything wrong here.

---

## Stream details

### 1. Project management / coordination — 🟢
- **Owner:** PRISM 2 project mgt
- **Depends on:** nothing · **Blocks:** nothing
- **Scope:** cross-stream coordination; owns and curates this board.
- **Last update 2026-07-24:** board created.

### 2. Medallion migration — ⏸️ paused
- **Owner:** PRISM 2 migration
- **Depends on:** Eugene (sample extract) + data-entry/migration UI cleanup (spawned task `task_67348b2e`, running in a separate session — the "codebase/column alignment" Eugene wants done before resuming) · **Blocks:** #3 (real typed inputs), #7, #8
- **Scope:** p1 → p2 typed/constrained `data_entries` + dimension-taxonomy cleanup.
- **Specs:** [schema-redesign-medallion.md](schema-redesign-medallion.md), [measure-catalogue-changelog.md](measure-catalogue-changelog.md), [kpi-time-series-spec.md](kpi-time-series-spec.md)
- **Also 2026-07-24 (design, while paused):** authored [kpi-time-series-spec.md](kpi-time-series-spec.md) — canonical `period` dimension for KPI targets+actuals; **affects #8 and #5/#9** (see cross-stream notes). Populated `organisations.financial_year_end` for 19 utilities.
- **Last update 2026-07-24:** PAUSED. Done this session: typed value cols + constraints (10 NOT-NULL dims, chk_one_value, unique address); 117-measure catalogue (115 active) w/ scope+applicability; rejection ledger + per-period scorecard (tested); energy taxonomy renamed **asset→category→technology→unit** + single **Storage** category (99717) for ESS; all "All X" → "All"; measure `category_id/subcategory_id → measures_group_id/measures_subgroup_id` (full rename); dropped is_descriptive/service_relevance_group/utility_service + lists 57/58. **Remaining before resume:** ~20 pre-existing tsc errors in legacy data-entry/migration paths (not updated for the new constraints) → handed to `task_67348b2e`; then loader parser + `scripts/migrate.ts` CLI (needs Eugene's sample extract) + `input_dl_def_mappings` regen. Still the critical-path blocker for downstream streams.

### 3. Calculator engine — 🟢 active
- **Owner:** PRISM 2 calculator
- **Depends on:** #2 for *real* typed entries (can build against mock/fixtures until then) · **Blocks:** #7 (likely)
- **Scope:** one-node "computed measures" model; per-input tag-card bindings across all 10 dims (FK-backed); manual KPI rebuild.
- **Spec:** [calculator-engine-spec.md](calculator-engine-spec.md)
- **Last update 2026-07-24:** **architecture decided end-to-end** (spec §3–§6, §4.4–4.6): single-node "computed measures" (KPI = a publishing facet via `source_measure_def_id`, not a separate node); per-input **tag-card bindings** (`formula_binding` + `formula_binding_dimension`, all 10 dims, FK-backed, states pin/All/inherit) replacing the 3-dim JSON blob; delete blocked if referenced / deactivate warns-not-drops; **engine unified by refactoring** (one core, thin write-adapters); **one evaluator, split roles** (app finest-scope live; gold-refresh job reuses the engine for rollups; gold never re-evaluates in SQL — current `fact_kpi_rollup` wrongly `AVG`s ratios); **gold refresh model** (materialized, 4 dirty-events, provisional-vs-approved surfaces, freshness stamps); **cross-scope aggregation = common/deep/two-axis** (grain unit→…→country AND dimension technology→category→asset; ratios rolled up by summing additive inputs then applying formula, never averaging). Found+fixed a live bug: KPI `formula_inputs` used legacy `input_def_id` key the resolver ignored → shim + backed-up migration (129 defs) shipped & verified. Also found KPI defs reference a **disjoint pre-collapse id universe** (225/259 unresolvable) → confirms **manual KPI rebuild** post-migration. **Next:** revisit UI mockups vs new model; then schema tracer-bullets (`formula_binding` tables → `fact_kpi` by level+scope → `source_measure_def_id`). Still mockable until #2 lands.
- **⚠ Cross-stream (with #8/#5/#9 time-series) — proposal posted:** the calculator's computed-KPI store is the *same table* as **`kpi_actual`**. Resolved on my side: **no separate `fact_kpi`** — write `kpi_actual`, which **reuses the `data_entries` address model** (grain anchor + 10 dim slices + `period_id`), calculator sole writer. Awaiting #2/#8/time-series confirmation — see cross-stream note below.

### 4. Schema for AI — ⚪ not started (confirm)
- **Owner:** PRISM 2 schema for AI
- **Depends on:** likely #2 stable · **Blocks:** —
- **Scope:** *(owning session: fill in — schema shaping for AI consumption / prism-ai-report?)*
- **Last update 2026-07-24:** seeded from session name; needs confirmation.

### 5. BSC Builder — 🟢 active
- **Owner:** PRISM 2 BSC
- **Depends on:** #9 (spec); targets sub-work depends on time-series `kpi_target` design (see #5/#9 cross-stream note) · **Blocks:** —
- **Scope:** template + per-utility overlay; design locked 2026-06-10. Now also: the "+ Add KPI" tracking picker (KPI **or** Input) and per-metric targets/trajectory.
- **Spec:** [bsc-builder-spec.md](bsc-builder-spec.md)
- **⚠ WORKING IN A WORKTREE:** this stream now works from `C:/Users/eugen/prism-bsc` (worktree on branch `feat/bsc-input-kpi-picker`) — NOT the shared main tree — after a clobber incident (see cross-stream note). Do not assume the BSC session is editing the main tree.
- **Last update 2026-07-26:** 🟢 active. **Merged to main** earlier: legacy BSC tabs + dead scorecard backend/tests removed (PR #20); settings card fix + step-7 tests (PR #19). **PR #35 MERGED to main (`d94567c`):** (a) "+ Add KPI" cascading **Input/KPI picker modal** (Source→Category→Subcategory→metric, per-table values) + "Create New" classifier (scaffold); migration `0031` adds `bsc_kpi_link.input_definition_id`. (b) **KPI trajectory feature REMOVED end-to-end** (Eugene's call) — dropped the Trajectory dropdown, Preview trend/Matched-Mismatched pill, `setKpiTrajectory`/`/trajectory` route+validator, `KpiTrajectory` type, and the **`kpi_target_trajectory` table** (migration `0032`, dropped on the dev DB). Targets + the Targets-set pill are kept. Migrations 0031/0032 applied to dev DB. **DEFERRED (needs #9 reconcile):** Targets for Input-tracked items → must land on the incoming relational **`kpi_target`** (extended with `input_definition_id`), NOT a parallel `input_definitions.targets` JSON.

### 6. BSC strategy map — ✅ done (build merged)
- **Owner:** PRISM 2 BSC strategy map
- **Depends on:** #5 (BSC Builder overlay + map-flagged nodes) · **Blocks:** —
- **Scope:** Tier-1 causal strategy map — Kaplan–Norton quadrant layout of map-flagged objectives; cause-effect links = per-utility BLO links **plus** BMO-authored **master links** (`bsc_template_link`) that cascade to every utility as locked edges; drag-to-position, click-to-link.
- **Spec:** [bsc-builder-spec.md](bsc-builder-spec.md) §13, [adr/0002-bsc-strategy-map.md](adr/0002-bsc-strategy-map.md)
- **Last update 2026-07-24:** ✅ design + build complete and **merged to main** — PR #15 (schema `0028`/`0030`, read model, link CRUD, UI + quadrant layout, master/locked links) and PR #19 (93 tests, green). Only external follow-ups remain: Eugene to redeploy `dev.prismdashboard.org` so it surfaces there (deploys owned by Eugene); dev BMO/BLO role-mismatch **resolved**. Shares files with #5 in the main tree — coordinate before refactors.

### 7. KPI calculator (multi-…) — ⚪ not started (confirm)
- **Owner:** PRISM 2 KPI calculator
- **Depends on:** likely #3 (calculator engine) · **Blocks:** —
- **Scope:** *(owning session: fill in — "multi-" what? multi-utility? multi-level?)*
- **Last update 2026-07-24:** seeded from session name; needs confirmation.

### 8. Multi-level data hierarchy — 🟢 active (design phase)
- **Owner:** PRISM multi-level data hier
- **Depends on:** #2 — both streams redesign `data_entries`; reconcile schemas before any DDL · **Blocks:** —
- **Scope:** replace PRISM 1's virtual-generator pattern with a level-anchored `data_entries`: one nullable FK per level (equipment / power station / service area / organisation / country) + "exactly one anchor" check ("Option A"; reporting-entity supertype considered and set aside). Companion change: enrich `report_periods` with explicit start/end dates + granularity for time-based reporting.
- **Last update 2026-07-24:** design direction chosen with Eugene (Option A); backfill approach sketched (promote entries off virtual resources/areas to their real entity); rationale incl. AI-readability discussed. No code changes yet. Next: reconcile target `data_entries` shape with #2's medallion spec, then write migration.

### 9. BSC Builder specification — 🟢 active
- **Owner:** BSC Builder specification
- **Depends on:** — · **Blocks:** #5 (feeds the build)
- **Scope:** authoring/maintaining the BSC Builder spec.
- **Spec:** [bsc-builder-spec.md](bsc-builder-spec.md)
- **Last update 2026-07-24:** seeded; owning session confirm current state.

### 10. Tiered access / tenancy — 🟢 active (design)
- **Owner:** PRISM 2 tiered access
- **Depends on:** — · **Blocks / overlaps:** #8 (both touch the `organisations` model — this stream replaces `is_utility` with a two-axis `relationship`/`entity_type` model; coordinate before any org DDL)
- **Scope:** consumer subscription tiers (Basic/Premium/Pay-per-project) + seats + entitlements; two-axis org model (utility / ppa_member / subscriber); multi-org **act-as** seats; registration dedup + split routing; manual card payment via new **PPA_FIN** role with a DEV gateway switch; time-boxed seats + BMO-configurable reminders.
- **Spec:** [tiered-access-and-registration-spec.md](tiered-access-and-registration-spec.md)
- **Last update 2026-07-26:** ⏸️ paused (design authored + grilled with Eugene; awaiting the two parked items below before schema). **Locked:** two-axis org model, seat junction (concurrent multi-org seats), unify (org-of-one), consumer-only tiers, act-as effective access, entitlement table (dashboard × view/download), manual-payment-now + gateway-switch, 48h admin+consultant reminders (BMO-configurable), join-existing→org-admin→BMO-revert. **Glossary updated** (`CONTEXT.md`: BLO = Utility Liaison + bulk-upload shared w/ DAOs). **Resolved 2026-07-26:** PCI — *no PAN in PRISM* (bank virtual terminal, PRISM records result only: txn ref/status/amount/2 timestamps + brand+last4); *full unify now* (provider side → seats, sequenced first); manual checkout = subscriber self-initiates request, Finance completes. **Still open:** Default-plan contents (awaiting Eugene's associate), PPA-member entitlements. No code yet.

---

## Cross-stream dependency notes

- **#2 Medallion is the bottleneck.** While paused, #3/#7/#8 either work against mock data or stall. When it unpauses, ping those rows.
- **Same working tree = clobber risk.** Sessions editing `C:\Users\eugen\prism` directly (not in a worktree) can overwrite each other's uncommitted files. Coordinate here before large refactors; prefer worktrees for parallel edits.
  - **Incident 2026-07-26 (#5 BSC):** the main tree was left checked out on `main` with **~84 uncommitted files from another stream (medallion/migration etc.) + junk-message commits (`dde`,`rrdd`,`fff`,`ssff`,`dewd`)**. The BSC session had been on the shared tree and briefly edited 3 files there; caught before commit and reverted (no loss to the other stream). BSC now works from worktree `C:/Users/eugen/prism-bsc`. **Action for whoever owns that WIP:** commit or stash the main tree — it's blocking clean branch switches and risks clobber for anyone on the main tree.
- **BSC cluster** (#5, #6, #9) is one conceptual area — keep those three rows consistent with each other.
- **#2 and #8 both redesign `data_entries`** (typed/constrained columns vs. per-level anchor FKs). These must land as one agreed target schema — whichever stream writes DDL first should fold the other's requirements in, and neither should migrate `data_entries` without checking the other's row here.
- **KPI targets/actuals time-series — RECONCILED + APPROVED by Eugene 2026-07-24** ([docs/kpi-time-series-spec.md](kpi-time-series-spec.md) §8). Design is locked — #8 and #5/#9 implement their portions per below. A canonical **`period` dimension** is the shared time axis (FY buckets per-utility from `organisations.financial_year_end` — populated for 19; monthly dormant, `is_mth_reports_relevant` all FALSE). Resolved decisions each owning stream implements:
  - **#8:** `report_periods` gets a `period_id` FK — do **not** add start/end/granularity columns to it (they live on `period`). Your level-anchor `data_entries` work is orthogonal (WHERE not WHEN) and proceeds independently. **Rename decision (Eugene 2026-07-24):** `report_periods` → **`submissions`** (`report_period_id` → `submission_id` on `data_entries`/`kpi`/etc.); `report_type` + `report_date` **fold into `period`** and are dropped (no `submission_type`). It's a *reporting instance/work-order*, not a time anchor. Physical rename lands with this rework, pre-migration — coordinate with #2 (touches `data_entries` + the migration extract contract).
  - **#5/#9:** keep `bsc_kpi_target_plan` (0026) as the *plan*, but its `periods` JSON resolves to `period` rows; migrate `kpi_definitions.targets` JSON → relational **`kpi_target(kpi_def_id, utility_id, period_id, value)`** (all test data → clean rebuild). Your §5 principles hold (shared store, inline edit, trajectory per (utility,kpi), no per-period versioning) — only the storage shape changes.
  - **Actuals:** `kpi` table → **`kpi_actual(…, period_id, …)`**, computed from `data_entries` roll-up (needs #3 calculator). Target lives only in `kpi_target`.
  - **Build order:** `period` dim first (joint), then report_periods FK, then `kpi_target`, then `kpi_actual`.

- **`kpi_actual` = the computed-KPI table (PROPOSED by #3 2026-07-24 — #2/#8/time-series owner please confirm).** The calculator (#3) was about to spec a `fact_kpi`; it's the **same table** as `kpi_actual`. To avoid duplication: **one table named `kpi_actual`, calculator is the sole writer, #5/#9 read it** (targets stay in `kpi_target`). Anti-divergence rule: **`kpi_actual` reuses the `data_entries` address model** rather than inventing new keying — proposed columns `(kpi_def_id, period_id, grain anchor [#8's equipment/power-station/service-area/organisation/country + exactly-one-anchor], the 10 dimension slice columns [#2's medallion `data_entries`], value, computed_at, formula_version)`. The grain anchor + dimension slices are exactly what give the calculator its two-axis rollup keying (unit→…→country × technology→category→asset). **Needed before DDL:** #8 confirm the grain-anchor shape is shared, #2 confirm the dimension columns **and** (as author of `kpi-time-series-spec.md`) the merged `kpi_actual` column set incl. `period_id`. Spec: [calculator-engine-spec.md](calculator-engine-spec.md) §4.4.

- **`kpi_limit` = KPI limit bands (FOR #5/#9 to pick up — design proposed by #3 2026-07-24 with Eugene).** Replaces the `kpi_definitions.limits` JSON. Limits are **KPI-specific (no `utility_id`)**, **time-varying (`period_id`)**, **set by the BMO** (needs `notes` + `set_by` + `set_at`, history preserved not overwritten), and — key point — **vary by dimension** (e.g. Capacity Factor band differs by technology/category). So they reuse the calculator's tag-card model: `kpi_limit(id, kpi_def_id, period_id, lower, upper, notes, set_by, set_at)` + child `kpi_limit_dimension(kpi_limit_id, dimension_key, member_id)`. Evaluated at the **gold/read layer** against `kpi_actual` → "within band / breached" flag (like `meets_target`), **not** in the calculator engine. Resolution = most-specific slice match, walking technology→category→asset (Solar band → else Renewable → else KPI-wide default). Full design: [calculator-engine-spec.md](calculator-engine-spec.md) §5.6.
