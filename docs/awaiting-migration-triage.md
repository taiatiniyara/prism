# "Awaiting #2 (migration)" — dependency triage + action plan

**Author:** #2 (migration) · **Date:** 2026-09-09 · **For:** Eugene + #1 coordination.

Several streams are marked "gated on #2" on the board. This sorts each item by *why* it waits and *whether it can be unblocked now*, so the additive work lands immediately and only the genuinely-structural work waits for the one big reimport package.

## Why anything waits on #2 (four reasons)

1. **#2 is the sole author of all shared-table DDL** (Eugene ruling 2026-07-26) — the firebreak against the two-track schema drift that wiped `data_entries` on 2026-09-04. So any structural change to `data_entries` / `kpi_actual` / `report_periods`(→`submissions`) / new shared tables routes through #2.
2. **Destructive/large DDL is bundled into ONE combined reimport** (relevance surface, temporal spans, unit stints) — they change the extract contract, so they ride a single migration rather than churning the big tables repeatedly.
3. **Some streams compute from migrated raw data** — largely **cleared by Load #16** (data_entries reloaded); only the known gaps remain (340/342, computed-layer regen).
4. **#12 RLS needs #2's grain-writer live** — the isolation guarantee depends on every row carrying a consistent `utility_id` chain.

## Ordering constraint discovered (shapes the plan)

`drift-check` **errors** (exit 1, `MISSING TABLE`) on a table that's in the Drizzle model but not yet in the DB. So a "model-ahead" PR fails CI. For **additive new tables** the compliant order is:

> **SQL-script PR → merge → apply to p2 → Drizzle-schema PR → merge.**

git-first holds (the migration script is the committed change), and drift-check stays green at every gate (it only iterates *model* tables, so DB-only tables between the two PRs are invisible to it).

## Triage

| Item | Owner | Bucket | Reason |
|---|---|---|---|
| `sector_terminology` table | #13/#11 | **LAND NOW (additive)** | ratified shape; `sectors` exists; seed = ratified app-config labels |
| `organisation_sector` M:N table | #13/#10 | **LAND NOW (additive, empty)** | ratified shape; both FK targets exist; membership backfill left to owners |
| `service_areas.sector_id` + drop `provides_*` | #13/#8 | **DEFER to #13** | NOT a clean backfill — 4 `provides_water` + 2 `provides_sanitation` rows exist; a scalar `sector_id` can't hold a multi-provides area. Modelling call, not a #2 land. Boolean drop is destructive. |
| `kpi_target` (relational) | #5/#9 | **STRUCTURAL package** | keyed on `period_id`; the `period` dimension doesn't exist yet (build-order puts period first). Pull-forward-able as bare-int `period_id` if #5 wants to start early. |
| `period` dimension | #2 (+#8/#5) | **STRUCTURAL package** | the canonical time axis; nothing built ([kpi-time-series-spec.md](kpi-time-series-spec.md)) |
| `kpi_actual.period_id` FK | #2 | **STRUCTURAL package** | bare-int today; FK lands with `period` |
| `report_periods → submissions` rename (+ `submission_type`/`submission_date` renames, `bm_opted_in` keep, derived 100%-gated status) | #2 (+#8/#4) | **STRUCTURAL package** | destructive rename; [submissions-rename-plan.md](submissions-rename-plan.md) |
| `measure_relevance` + `relevance_mode` | #4 | **STRUCTURAL package** | rides the ONE combined temporal-spans reimport (extract-contract change) |
| #8 grain / query-pass DDL amendments | #8/#11 | **STRUCTURAL package** | part of the reimport package |
| #12 RLS enable | #12 | **NOT DDL** — needs grain-writer live + Eugene greenlight | not a table to land |
| Manual KPI rebuild (unblocks #3 backfill #238) | #3 (+#2) | **DATA — now unblocked by Load #16** | re-point KPI defs to current measure ids; no #2 DDL, coordinate |

## Actions

### Now (this pass) — additive, git-first
1. **`sector_terminology`** — create + seed the 3 ratified `service_area` rows (Electricity→Grid, Water→Supply Zone, Sanitation→Catchment). Unblocks #13's `lookupTerm`→table repoint + #11's Phase 5b.
2. **`organisation_sector`** — create (empty). Unblocks #11's `getActiveSector` + #10's sector membership. Membership rows left to #10/#13 (multi-sector data call).
   - Sequence: SQL PR → apply → Drizzle-schema PR (per the ordering constraint above).
   - Broadcast to #11/#13/#10 on apply; flag the `service_areas` multi-sector finding to #13/#8.

### The structural package (schedule as one campaign — Eugene to time)
Consolidated from [kpi-time-series-spec.md](kpi-time-series-spec.md) build order + [submissions-rename-plan.md](submissions-rename-plan.md), refreshed for what shipped since (FYE done, `kpi_actual` landed, `bm_opted_in` + per-period participation live, derived-status ruling):

1. `period` dimension (joint #2/#8/#5)
2. `submissions` rename + `submission_type`/`submission_date` (Eugene's rename) + `bm_opted_in` kept + **derived, 100%-gated `status_id`** (rolled up from `data_entries`; publish-gate tightens to fully-approved-only — #8 sign-off) + `submissions.period_id` FK
3. `kpi_target` relational + `bsc_kpi_target_plan.periods`→period refs (#5/#9)
4. `kpi_actual` roll-up compute + `period_id` FK (#3)
5. `measure_relevance` + `relevance_mode` + temporal spans + unit stints — the ONE reimport (#4/#8)

### Owner decisions needed
- **#13/#8:** how do multi-provides `service_areas` (4 water, 2 sanitation) map to `sector_id` — scalar + split areas, or a per-sector model? Blocks `service_areas.sector_id`.
- **Eugene:** timing for the structural package (standalone submissions rename now vs bundled — #4's lean is bundled); and whether to pull `kpi_target` forward as bare-int for #5.
