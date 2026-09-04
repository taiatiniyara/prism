# PRISM 2 — naming change log

Single tracking table for every column / table / list / member **name change** in the PRISM 2 redesign — current → new, status, and why. One row per change. Keep this current whenever a name changes.

**Status:** ✅ applied (in DB now) · 📐 design (approved, not built) · ❌ dropped

| kind | current | new | status | why |
|---|---|---|---|---|
| column | `measure_definitions.category_id` | `measures_group_id` | ✅ 2026-07-23 | "category" now names the **energy** dimension (was `type`); rename the measure's grouping to avoid the clash |
| column | `measure_definitions.subcategory_id` | `measures_subgroup_id` | ✅ 2026-07-23 | same as above |
| list (12) | "Measures Category" | "Measures Group" | ✅ 2026-07-23 | matches the renamed column; disambiguate from energy "Category" |
| list (13) | "Measures Subcategory" | "Measures Subgroup" | ✅ 2026-07-23 | same |
| list label (3) | "Energy Type" | **Category** | ✅ 2026-07-23 | generic term that spans generation *and* storage; the thing we slice by (column `energy_type_id` unchanged) |
| list label (4) | "Energy Source" | **Technology** | ✅ 2026-07-23 | "source" is generation-centric; a battery isn't a *source* — "technology" fits gen + storage (column `energy_source_id` unchanged) |
| list label (55) | "Energy Resource Type" | **Asset** | ✅ 2026-07-23 | names the asset's role (Generation/Storage); "resource type" was vague (column `energy_resource_type_id` unchanged) |
| concept label | "resource" (energy_resources rows) | **unit** | ✅ 2026-07-23 | the specific generator/battery *instance*, distinct from the "asset" *class* (table/column unchanged) |
| member (984) | Generator | Generation | ✅ 2026-07-23 | reads cleaner as an asset-class value |
| member (985) | Energy Storage | Storage | ✅ 2026-07-23 | same |
| member (40) | "All GEN" | All | ✅ 2026-07-23 | one generic un-sliced technology member |
| members (×15) | "All Customers", "All Payment Modes", "All DL Categories", … | All | ✅ 2026-07-23 | normalize every dimension's/list's All-member to plain "All" |
| column | `measure_definitions.is_descriptive` | ❌ dropped | ✅ 2026-07-23 | no longer meaningful |
| column | `measure_definitions.service_group_id` (`service_relevance_group_id`) | ❌ dropped | ✅ 2026-07-23 | legacy contextual-measure mechanism, superseded by scope/applicability (list 58 also deleted) |
| column | `measure_definitions.utility_service_id` | ❌ dropped | ✅ 2026-07-23 | unused (all null); legacy list 57 also deleted |
| table | `report_periods` | **`submissions`** | 📐 design (pre-migration) | it's a utility's *reporting instance / work-order*, not the time axis — `period` now owns time |
| column | `report_period_id` (`data_entries`, `kpi`, …) | **`submission_id`** | 📐 design | follows the table rename |
| column | `report_periods.report_type_id` | ❌ dropped | 📐 design | granularity moves to `period.kind`; redundant on the submission (no `submission_type`) |
| column | `report_periods.report_date` | ❌ dropped | 📐 design | it encoded the period; `period.period_start`/`period_end` own that now |

| measure term | "Installed Capacity" | **Rated Capacity** | ✅ 2026-07-26 | term superseded — carry the **new** term only. Measure names (320, 410) already "Rated Capacity"; definition prose updated; old-term entries **removed** from synonyms/alt-names (genuine synonyms like "nameplate capacity" kept for AI search). Power BI DAX renamed incl. the literal column `[Installed Capacity (MW)]`→`[Rated Capacity (MW)]`, output labels, descriptions, and query slugs `installed_capacity`→`rated_capacity` (+ the AI tool catalog). **⚠ Eugene: the Power BI *model* column must be renamed to `Rated Capacity (MW)` to match, or those queries fail.** One-off scripts + the KPI-guide historical note also updated. |

### Physicalisation — the energy dimensions became real physical columns (PR #68)
The 2026-07-23 rows above deliberately left the DB columns unchanged (display-relabel only). That was **superseded**: the columns were then **physically renamed** to drop the `energy_` prefix, so DB now matches the terminology. **This corrects the "(column unchanged)" notes above — those column names no longer exist.**

| kind | current | new | status | why |
|---|---|---|---|---|
| column | `data_entries.energy_provider_id` | `provider_id` | ✅ 2026-07-27 (PR #68) | physicalise: DB column now matches the "Provider" term (all consumers repointed) |
| column | `energy_type_id` | `category_id` | ✅ 2026-07-27 (PR #68) | physicalise → "Category" |
| column | `energy_source_id` | `technology_id` | ✅ 2026-07-27 (PR #68) | physicalise → "Technology" |
| column | `energy_resource_type_id` | `asset_class_id` | ✅ 2026-07-27 (PR #68) | physicalise → "Asset Class" |
| column | `energy_resource_id` | `unit_id` | ✅ 2026-07-27 (PR #68) | physicalise → "Unit" |
| table | `energy_resources` | `units` | ✅ 2026-07-27 (PR #68) | the generator/battery instance is a **unit**; table + code type `EnergyResource → Unit` (~152 identifiers) |

### Taxonomy vocab + grain renames (PR #78, and follow-ups)
| kind | current | new | status | why |
|---|---|---|---|---|
| column | `agg_level_id` | `strata_id` | ✅ 2026-07-27 (PR #78) | "strata" names the grain level; on `data_entries` / `kpi_definitions` / `measure_definitions` / `service_areas` |
| column | `asset_id` | `asset_class_id` | ✅ 2026-07-27 (PR #78) | consistency with "Asset Class"; on `data_entries` / `asset_class_relevance` / `managed_list_items` / `units` |
| table | `energy_resource_type_relevance` | `asset_class_relevance` | ✅ 2026-08-01 | follows list 55 → "Asset Class"; code export `energyResourceTypeRelevance → assetClassRelevance` too |
| list (1) | "Aggregation Level" | **Strata** | ✅ 2026-07-28 | the grain-level vocabulary (pairs with `agg_level_id → strata_id`) |
| list (2) | "Energy Provider" | **Provider** | ✅ 2026-07-28 | sector-neutral (pairs with `energy_provider_id → provider_id`) |
| list label (55) | "Asset" | **Asset Class** | ✅ 2026-07-28 | sharpened from the 2026-07-23 "Asset" relabel — it names the asset **class** (Generation/Storage), distinct from a unit instance |
| member (1) | "Equipment" | **Unit** | ✅ 2026-07-28 | the level-1 grain member = a unit |

### Country-context metric key repoint (2026-08-23, #4)
The `country_context` table keyed its metric on `dl_def_id → managed_list_items`, but the
country-context metrics are `measure_definitions` in subgroup **221 "Country Context"** (ids
1..16). 11 of the 14 fact-route metrics don't exist in `managed_list_items` at all, so the
legacy key could not represent them. Table was empty → clean repoint.

| kind | current | new | status | why |
|---|---|---|---|---|
| column | `country_context.dl_def_id` | `measure_def_id` | ✅ 2026-08-23 | rename + FK repoint `managed_list_items → measure_definitions` (subgroup 221); matches `data_entries.measure_def_id` |
| constraint | FK `country_context.dl_def_id → managed_list_items` | FK `measure_def_id → measure_definitions(id)` | ✅ 2026-08-23 | metrics live as measure_definitions, not DL items |
| (read model) | facts read country context from `data_entries` (subgroup 221) | `getResolvedContextRows` **bridge** reads `country_context` + carry-forward per report-period | ✅ 2026-08-23 | Option 2 — national annual store, expanded to utility×period at read time |

### Spelling corrections
| kind | current | new | status | why |
|---|---|---|---|---|
| member (1030) | "Ancilliary Services" | **Ancillary Services** | ✅ 2026-08-25 | misspelled user-facing vocab (utility_function member); referenced by id everywhere, 0 code/DAX string refs → one-row fix |

## Notes
- **The 2026-07-23 relabels were display-only at first, then physicalised.** They initially changed display names only (columns left as `energy_type_id` etc. to keep it cheap). That was **superseded by the physicalisation block above (PR #68, 2026-07-27)** — the columns were then physically renamed (`energy_type_id → category_id`, …) so DB and terminology now match. Do **not** rely on the old `energy_*` column names. See `schema-redesign-medallion.md` §1.2a.
- **The `submissions` / `submission_id` rename is design-approved but NOT built** — it lands with the period-rework implementation because it touches `data_entries` and the migration extract contract; coordinate #2 ↔ #8. See `kpi-time-series-spec.md` (Naming note).
- **New columns/tables that are *additions* (not renames)** — e.g. `period`, `kpi_target`, `kpi_actual`, `time_aggregation`, `submissions.period_id` — are specified in `kpi-time-series-spec.md`, not tracked here (this log is renames/drops only).
