# PRISM 2 — Data Entry Schema Redesign (Medallion Architecture)

**Status: DRAFT for discussion** · 2026-07-09 **Scope:** the data-entry storage
model and everything derived from it, bottom-up in medallion order (Bronze →
Silver → Gold). Designed to land **with** the legacy data migration (currently
in design), so data is migrated once, into the final shape.

**Source analysis:** `p1_dl_def_ids_raw.xlsx` (515 legacy definitions,
dimension-classified), the current `data_entries` schema, and the locked design
decisions from the AI-optimisation review (gold layer as single semantic source;
Approved = publication event; BMO/DEV cross-utility access is
Financial-Year-only; Endorsed status retired).

---

## 0. Design principles

1. **A definition is a pure measure.** Dimension words (Solar, Prepaid,
   Residential, Female…) never appear in a measure's name. Every "which one" is
   a dimension **column** on the entry row. The 515 legacy definitions collapse
   to **~55–65 measures**.
2. **IDs in the tables, names in the views.** Storage rows carry foreign keys
   only; the Silver view resolves every ID to its label. Renames are one-row
   updates, never data migrations.
3. **Typed at the source.** The single `varchar(255) value` is replaced by typed
   value columns. The database itself rejects a non-number in a numeric field,
   on every write path.
4. **No NULL-as-"All".** Every dimension has an explicit **All** member and the
   column is NOT NULL. (A NULL/tagged mismatch is what silently broke the
   Planned SAIDI formula binding.)
5. **Read down, never write up.** Bronze is written by data entry; Silver and
   Gold are derived, refreshed automatically, and read by the AI, dashboards,
   reports, and external tiers.

---

## 1. BRONZE — raw, as entered (tables)

### 1.1 `measure_definitions` (today: `input_definitions`)

The collapsed catalogue. One row per measure, ~55–65 rows.

| Column                                                          | Type            | Notes                                                                             |
| --------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| id                                                              | serial PK       |                                                                                   |
| name                                                            | varchar         | e.g. "Generation Downtime — Planned" (no dimension words)                         |
| variable_name                                                   | varchar         | snake_case, unit-suffixed: `generation_downtime_planned_hours`                    |
| definition                                                      | text            | plain-English dictionary definition (AI-drafted → BMO-curated)                    |
| synonyms                                                        | json string[]   | industry alternate names                                                          |
| definition_status                                               | varchar         | `draft` \| `curated`                                                              |
| unit_id                                                         | FK managed_list | MWh, Hours, %, Currency, …                                                        |
| data_type_id                                                    | FK managed_list | `number` \| `boolean` \| `option` \| `text` — decides which value column rows use |
| category_id / subcategory_id                                    | FK managed_list | Operational / Financial / HR & Safety / Governance / Context                      |
| agg_level_id                                                    | FK managed_list | finest grain the measure is entered at                                            |
| valid_range_min / valid_range_max                               | **numeric**     | typed (today they are integers — decimals impossible)                             |
| is_mandatory, is_active, is_calculated, formula, formula_inputs | as today        |                                                                                   |
| sort_order, updated_at                                          | as today        |                                                                                   |

### 1.2 Dimension managed lists

**New lists (three):**

| List                 | Members (with **All** first)                                                                                                               | Collapses                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **Consumption Band** | All · 100 kWh · 500 kWh · 1,000 kWh · 10,000 kWh · Lifeline 60 / 120 / 180 · …                                                             | ~150 tariff-structure defs |
| **Division**         | All · Generation · Transmission · Distribution · Finance · ICT · HR · Procurement · PR/Marketing/Customer Service · Administration · Other | ~39 HR defs                |
| **Gender**           | All · Female · Male                                                                                                                        | (jointly with Division)    |

**Existing lists — the All members already exist (ids match the legacy workbook
tags); the gap is that entry rows don't use them:**

| List            | All member (id)                                                                                | Change required (verified on dev DB 2026-07-09)                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Energy Provider | All (20)                                                                                       | none — entries fully populated                                                                                                                                                                               |
| **Energy Type** | All (30); Conventional (31) / Renewable (32)                                                   | **new column on data_entries** — the type dimension exists in KPI formula bindings (the provider/type/source triple) but is not stored on entry rows today, so the engine must infer it; store it explicitly |
| Energy Source   | All GEN (40) / All ESS (58); All Conventional (41), All Renewable (42); specific fuels beneath | none — entries fully populated; hierarchy is rollup-friendly                                                                                                                                                 |
| Customer Type   | All Customers (690)                                                                            | **backfill: 45,453 of 52,129 entry rows carry NULL meaning "all/not sliced" → 690**                                                                                                                          |
| Payment Mode    | All Payment Modes (720)                                                                        | **backfill: same 45,453 rows NULL → 720**                                                                                                                                                                    |

After the backfill: NOT NULL constraints on all dimension columns, and every
write path (UI, import, KPI formula bindings) writes the All members explicitly.
This removes the NULL-as-All ambiguity that caused the Planned SAIDI
formula-binding failure (principle 4). The id alignment with the legacy workbook
(20/40/690/720) means the migration mapping carries dimension tags across
without translation.

### 1.3 `measure_dimension_scope` (unifies today's relevance tables)

Declares which dimensions apply to which measure — drives the entry UI (only
show the pickers that matter; everything else auto-fills its All member) and
validation.

| Column        | Type    | Notes                                                                       |
| ------------- | ------- | --------------------------------------------------------------------------- |
| measure_id    | FK      |                                                                             |
| dimension     | enum    | provider / source / customer_type / payment_mode / band / division / gender |
| is_applicable | boolean |                                                                             |

_Example: `employees_total` → division ✓, gender ✓, all others auto-All.
`tariff_rate` → customer_type ✓, payment_mode ✓, band ✓._

### 1.4 `data_entries` (redesigned)

One row = one fact, at the finest applicable grain.

| Column                                                               | Type                | Notes                                                                                                        |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| id                                                                   | uuid PK             |                                                                                                              |
| report_period_id                                                     | FK, NOT NULL        | implies utility + FY/Monthly report type                                                                     |
| service_area_id                                                      | FK, NOT NULL        | utility's "All areas" virtual member for utility-level measures                                              |
| measure_id                                                           | FK, NOT NULL        |                                                                                                              |
| energy_provider_id                                                   | FK, NOT NULL        | default **All (id 20)** — canonical, confirmed 2026-07-09                                                    |
| energy_type_id                                                       | FK, NOT NULL        | default **All (id 30)** — **new column**; completes the provider/type/source triple KPI bindings already use |
| energy_source_id                                                     | FK, NOT NULL        | default **All GEN (id 40)**; All ESS (58) for storage measures                                               |
| customer_type_id                                                     | FK, NOT NULL        | default **All Customers (id 690)**                                                                           |
| payment_mode_id                                                      | FK, NOT NULL        | default **All Payment Modes (id 720)**                                                                       |
| consumption_band_id                                                  | FK, NOT NULL        | default All — **new**                                                                                        |
| division_id                                                          | FK, NOT NULL        | default All — **new**                                                                                        |
| gender_id                                                            | FK, NOT NULL        | default All — **new**                                                                                        |
| energy_resource_id                                                   | FK, NULL            | optional finest grain (per generating unit) — **open question 4**                                            |
| **value_numeric**                                                    | **numeric**         | exact decimals; never float                                                                                  |
| **value_boolean**                                                    | **boolean**         | governance Yes/No items                                                                                      |
| **value_option_id**                                                  | **FK managed_list** | for option-typed measures (e.g. Electricity Regulation) — **open question 1**                                |
| **value_string**                                                     | **text**            | genuinely free text only                                                                                     |
| status_id                                                            | FK                  | Requested → Pending → Entered → Reviewed → **Approved** (Endorsed retired)                                   |
| comments                                                             | jsonb               | as today                                                                                                     |
| update_medium_id, is_relevant, is_deleted, updated_at, updated_by_id | as today            |                                                                                                              |

**Constraints**

- `CHECK`: at most **one** of the four value columns is non-null (all four null
  = awaiting entry; the status column carries the why).
- `UNIQUE` on (report_period_id, service_area_id, measure_id, + all seven
  dimension columns [+ energy_resource_id if kept]).
- Which value column a measure uses is dictated by
  `measure_definitions.data_type_id`, enforced by **one shared routing
  function** used by every write path (UI, Excel import, API, future document
  extraction).

**Example rows (IDs shown as labels for readability):**

| period     | area      | measure                     | provider | source  | cust.       | pay     | band    | div. | gender | value_numeric | value_boolean | value_option     |
| ---------- | --------- | --------------------------- | -------- | ------- | ----------- | ------- | ------- | ---- | ------ | ------------- | ------------- | ---------------- |
| EFL FY2024 | Viti Levu | electricity_generated_mwh   | Utility  | Diesel  | All         | All     | All     | All  | All    | 48210.5       |               |                  |
| EFL FY2024 | All areas | employees_total             | All      | All GEN | All         | All     | All     | ICT  | Female | 23            |               |                  |
| EFL FY2024 | All areas | tariff_rate                 | All      | All GEN | Residential | Prepaid | 100 kWh | All  | All    | 0.3421        |               |                  |
| EFL FY2024 | All areas | code_of_conduct_implemented | All      | All GEN | All         | All     | All     | All  | All    |               | true          |                  |
| EFL FY2024 | All areas | electricity_regulation      | All      | All GEN | All         | All     | All     | All  | All    |               |               | Price Regulation |

### 1.5 `data_entry_logs` (audit)

`previous_value` / `new_value` become a `jsonb` snapshot of the four typed value
columns (plus status), so audit history survives the retyping.

---

## 2. SILVER — cleaned & readable (materialised view)

### 2.1 `silver.data_entries_enriched`

**One row per Bronze row** — the descriptive twin. Every ID resolved to its
label (IDs retained alongside), values already typed by construction, plus
derived columns:

| Adds                                                   | Derived from                          |
| ------------------------------------------------------ | ------------------------------------- |
| utility, utility_id, country, sub_region, utility_size | period → organisation → country       |
| fiscal_year, report_type (FY / Monthly)                | period                                |
| measure, unit, category, definition_status             | measure_definitions                   |
| all seven dimension labels                             | managed lists                         |
| is_approved                                            | status_id ≥ Approved                  |
| value_display                                          | the populated value column, formatted |

_Same example row, Silver form:_
`EFL · Fiji · Melanesia · FY2024 · Viti Levu · Electricity Generated · Utility · Diesel · All · … · 48,210.5 MWh · Approved`

Refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY`, triggered by approval events
and KPI-worker completion. Because Bronze is born typed, Silver contains **no
casting logic** — only joins.

---

## 3. GOLD — business-ready (views over Silver + KPI engine output)

| Object                         | Grain                          | What it adds                                                                                                                                                                                                                   | Example row                                                                                   |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `gold.dim_utility`             | 1 row / utility                | flattened who's-who for grouping & peers                                                                                                                                                                                       | EFL · Fiji · Melanesia · Large · Government-owned                                             |
| `gold.fact_kpi`                | KPI × utility × period         | **computed** results + targets, limits, industry benchmarks, meets-target flags                                                                                                                                                | EFL · 2024 · System Losses · 11.8% · target 12% · ✅                                          |
| `gold.fact_kpi_rollup`         | KPI × hierarchy level × period | rows that exist nowhere in the data: service area → utility → country → sub-region → region, and month → FY. Built by **rolling up formula inputs and re-applying the stored formula at each level** (never averaging results) | Melanesia · 2024 · System Losses · 13.2%                                                      |
| `gold.v_reporting_status`      | utility × period               | workflow progress: counts per status, % complete, pending-with                                                                                                                                                                 | TPL · FY2024 · 53% complete · 85 awaiting review                                              |
| `gold.v_bsc_alignment`         | KPI ↔ initiative ↔ objective   | the utility's strategy map joined to actuals, so "how are we tracking against our strategy?" is answerable                                                                                                                     | EFL · Reduce Losses (objective) · Feeder upgrade (initiative) · System Losses 11.8% vs target |
| `gold.ext_*` (external slices) | as fact_kpi / rollup           | the **only** surface the paid tiers see: Approved-only + per-utility visibility flag applied + KPI results only (never raw entries)                                                                                            | —                                                                                             |

### 3.1 Access rules (enforced at the read layer, one place)

| Reader                                         | Sees                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Utility roles (CEO/EXE/MGR/DAO/BLO)            | own utility: everything incl. Monthly + provisional (labelled) |
| BMO / DEV                                      | cross-utility: **Financial Year data only**; Monthly never     |
| Cross-utility benchmarking (any reader)        | Approved-only                                                  |
| External tiers (Basic/Premium/Pay-per-project) | `gold.ext_*` only                                              |

---

## 4. Migration approach (one pass, into the final shape)

1. Derive the **measure list** from the 515 classified legacy defs (the
   classifier workbook's dimension tags do most of this mechanically; name
   families confirm it).
2. Create the three new managed lists + explicit All members on existing lists.
3. Map each legacy def → (measure, dimension tuple) — extends the existing
   `input_dl_def_mappings` pattern.
4. Land legacy values directly into the typed columns, routed by measure data
   type. Parse failures (audit found ~90 rows: 84 "Infinity" + placeholders) are
   **logged, not dropped**.
5. Re-point KPI `formula_inputs` at measures + dimension filters (systematically
   — the SAIFI re-pointing exercise of 2026-07-08 is the per-KPI template for
   this).
6. Ripples: KPI worker reads `value_numeric` directly (deletes casting code);
   Excel templates gain dimension columns instead of dimension-suffixed rows;
   legacy `/api/fact*` routes keep parity via the mapping table.

---

## 5. Open questions for this discussion

1. **`value_option_id` (4th typed column)** — recommended: option-typed measures
   store the chosen managed-list item's ID, not text. Keeps principle 2 intact.
   Accept?
2. **% storage convention** — audit finding 14: 28 %-KPIs store ratios, 2 store
   0–100. Recommended: store ratios everywhere; format as % at display. Decide
   once, normalise in migration.
3. **Rename `input_definitions` → `measure_definitions`?** Cosmetic but
   clarifying; the code currently says "input" everywhere. Decide before
   migration, not after.
4. **`energy_resource_id` grain** — keep per-generating-unit entries as an
   optional finest grain, or is service-area × source the floor? (Affects
   generation relevance UI and rollups.)
5. **Measure count sign-off** — the ~55–65 measure list needs a DHI/BMO review
   pass: the collapse is mechanical for ~90% of defs, judgment for the rest
   (e.g. is "IPP Lubrication Oil" a measure or `lubrication_oil` ×
   provider=IPP?).
6. **"Not Available" status vs. value** — status 7 (Not_Available) continues to
   mean "no value exists"; confirm nothing should ever write a sentinel into the
   value columns.

---

## 6. What this buys (recap)

- **AI readability:** one dictionary entry per measure (~60, not 245+); every
  question becomes the same query shape (measure + dimension filters); no
  name-matching ambiguity.
- **Data quality at the gate:** the DB rejects wrong-typed values on every write
  path; the "Infinity" class of defect becomes impossible.
- **Simplicity downstream:** Silver is joins-only; Gold rollups are natural
  aggregations; Power BI and the report engine read the same shelves the AI
  does.
- **One migration, not two:** the legacy data lands once, into the shape
  everything else was designed for.
