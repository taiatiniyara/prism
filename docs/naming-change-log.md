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

## Notes
- **"list label" / "concept label" rows change display names only** — the underlying DB **columns are unchanged** (e.g. `energy_type_id` stays; UI/dictionary/docs read "Category"). This kept the taxonomy rename cheap. See `schema-redesign-medallion.md` §1.2a.
- **The `submissions` / `submission_id` rename is design-approved but NOT built** — it lands with the period-rework implementation because it touches `data_entries` and the migration extract contract; coordinate #2 ↔ #8. See `kpi-time-series-spec.md` (Naming note).
- **New columns/tables that are *additions* (not renames)** — e.g. `period`, `kpi_target`, `kpi_actual`, `time_aggregation`, `submissions.period_id` — are specified in `kpi-time-series-spec.md`, not tracked here (this log is renames/drops only).
