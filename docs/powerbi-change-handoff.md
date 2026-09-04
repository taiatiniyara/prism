# Power BI integration — change handoff

For the **Power BI developer**. Lists the changes the Power BI side needs so it stays in sync with PRISM's terminology.

## 2026-08-26 — new fields your queries must pick up (refresh alone won't show them)

The API now serves these fields, but if your queries expand an explicit field
list they will not appear on refresh until added to the query:

| table | JSON key | notes |
|---|---|---|
| `Fact Safety` | **`Total Hours Worked`** | served on every `/api/factSafety` row (number). 43 of 77 periods carry values — the rest are genuinely unreported periods, so partial nulls are expected. |
| `Fact UtilityCosts`, `Fact FinancialAccounts`, `Fact TariffStructure` | **`Multiplier`** | served on every row: `"Ones" \| "Thousands" \| "Mixed"` (scale the reporter used; true LCU = value × multiplier). An alias key **`Multipler`** is also emitted in case the model column uses that spelling — bind one or the other, not both. |

---

## Context (how PRISM talks to Power BI)

- The PRISM app sends **DAX** to a Power BI **semantic model** via the REST `executeQueries` API. The query catalog + DAX + schema map live in `lib/ai/data-service/pbi-queries.ts`, `pbi-schema-registry.ts`, `pbi-insights.ts`, and the AI tool catalog in `lib/ai/tools/power-bi.ts`.
- **The REST API integration itself (auth, workspace/dataset id, endpoint) is UNCHANGED** — nothing to do there.
- What changed: PRISM renamed the measure **"Installed Capacity" → "Rated Capacity"**. This is the one *breaking* change right now, plus some non-breaking roadmap items below.

---

## Part 1 — Power BI semantic model (dataset) changes  ·  **required now**

**1.1 Rename the column** (breaking):

| table | current | new |
|---|---|---|
| `Fact GeneratorsData` | `Installed Capacity (MW)` | **`Rated Capacity (MW)`** |

> ⚠ **The PRISM app's DAX has already been updated** to reference `[Rated Capacity (MW)]`. Until the model column is renamed to match, **every capacity-related query fails** ("column cannot be found"). This rename is the hard dependency.

**1.2 Update everything in the model that references that column** — DAX measures, calculated columns, hierarchies, field parameters, and any **report-page visuals / tooltips / bookmarks / slicers** built on `Installed Capacity (MW)`.

---

## Part 2 — DAX changes

### 2a. Already applied in the PRISM app (for your cross-check — no action, just so names line up)

| change | detail |
|---|---|
| column ref | `'Fact GeneratorsData'[Installed Capacity (MW)]` → `[Rated Capacity (MW)]` — **~34 refs** across ~10 queries in `pbi-queries.ts` (`rated_capacity`, `rated_capacity_by_utility`, generation **capacity factor**, **CO₂** estimate, **renewable-share**, **diesel-share**, utility profile, peer comparison, whatif, …) plus the schema registry + insights narrative |
| output aliases | `"Installed MW"` → `"Rated MW"` |
| query slugs | `installed_capacity` / `installed_capacity_by_utility` → `rated_capacity` / `rated_capacity_by_utility` (app-internal ids; only relevant if you call PRISM's query catalog by name) |
| descriptions/labels | "installed capacity" → "rated capacity" |

### 2b. To do on the Power BI side

- Update any **DAX measures / calculated columns** in the model that reference `[Installed Capacity (MW)]` → `[Rated Capacity (MW)]`.
- Update **report-visual DAX** (visual/page filters, conditional formatting, calculation groups) referencing the old name.

---

## Roadmap / heads-up (NOT required for the Installed→Rated fix)

These are larger, separate items — flagged so they're on your radar, not for this pass:

1. **Dimension label alignment.** PRISM renamed its dimensions: `Energy Type → Category`, `Energy Source → Technology`, `Energy Resource Type → Asset`, and "resource" → "unit". **The app DAX still uses `[Energy Source]` / `[Energy Type]`** (not changed), so no immediate model change is needed. If you want the model to mirror PRISM's vocabulary, rename those columns **and** sync the app DAX together — coordinate with the PRISM team (don't rename one side alone).
2. **Member-value changes.** `All GEN → All`; `Generator → Generation`; `Energy Storage → Storage`; removed `All Renewable`/`All Conventional`/`All ESS`/`Other Renewable`/`Other Conventional`; ESS (Battery / Hydro Pumped Storage / Hydrogen Cells) is now a **Storage** category. If any model DAX **hardcodes** these values in filters, update them. (Current app DAX only filters on `Diesel / Solar / Wind / Hydro / Biomass / Geothermal / Renewable` — all unchanged.)
3. **Major — re-point the model to PRISM 2.** The model is currently fed from **PRISM 1** data. PRISM 2's medallion migration changes the source of truth (typed `data_entries` + a gold layer). Once migration lands, the model will need re-pointing to the **PRISM 2 gold layer** (`fact_kpi` / `data_entries` roll-ups on the new taxonomy). Treat this as its own project — it supersedes ad-hoc column patches.

---

*Immediate action for this handoff: **Part 1.1 + 1.2 + 2b** (rename `Installed Capacity (MW)` → `Rated Capacity (MW)` and fix everything referencing it). The app side (Part 2a) is done.*
