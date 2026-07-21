# PRISM 2 — Data Entry Schema Redesign (Medallion Architecture)

**Status: DRAFT for discussion** · updated 2026-07-09 to **as-built** state

> **As-built status (full-schema audit, second pass, 2026-07-09 PM):**
> **BUILT** — all 32 physical columns on `data_entries` (typed values, 10 dimensions,
> hierarchy columns, legacy `value` retained), with **`input_def_id` renamed →
> `measure_def_id`**; the definitions table **physically renamed** to `measure_definitions`
> (see defect below); the **managed-lists system rebuilt** — a proper `managed_lists` parent
> table (62 lists) with `managed_list_items.list_id` NOT NULL; **all new dimension lists
> created with members** (Division, Consumption Band, Utility Function, Gender, Energy
> Resource Type — canonical ids in §1.2), including the **`Customer` provider (id 23)**;
> `measure_dimension_scope` table created; `data_entry_logs.value_snapshot` added;
> `energy_resource_type_relevance` table added; `silver.data_entries_enriched` + all seven
> gold views live; AI reads silver/gold; Endorsed retired.
>
> ~~Trailing-space defect in the table name~~ — **FIXED 2026-07-09**: the table is now
> exactly `measure_definitions` (verified; 505 rows / 104 active / 101 draft definitions
> intact).
>
> **PENDING** — `measure_dimension_scope` is built but **empty** (population = part of the
> catalogue collapse); **no constraints on `data_entries` yet** (NOT NULLs, at-most-one-value
> CHECK, true 10-dimension UNIQUE — `uniq_entry` remains a NON-unique 8-column index) — these
> go on the empty table during the **flush-and-reload migration (§4)**.
> Vocabulary finalised 2026-07-09: "Every" members deleted; resource-type Nill → All (983);
> list-name typo fixed (`scripts/fix-dimension-lists.ts` — **run on prod too**).
**Scope:** the data-entry storage model and everything derived from it, bottom-up in medallion order (Bronze → Silver → Gold). Designed to land **with** the legacy data migration (currently in design), so data is migrated once, into the final shape.

**Source analysis:** `p1_dl_def_ids_raw.xlsx` (515 legacy definitions, dimension-classified), the current
`data_entries` schema, and the locked design decisions from the AI-optimisation review
(gold layer as single semantic source; Approved = publication event; BMO/DEV cross-utility
access is Financial-Year-only; Endorsed status retired).

---

## 0. Design principles

1. **A definition is a pure measure.** Dimension words (Solar, Prepaid, Residential, Female…)
   never appear in a measure's name. Every "which one" is a dimension **column** on the entry row.
   The 515 legacy definitions collapse to **~55–65 measures**.
2. **IDs in the tables, names in the views.** Storage rows carry foreign keys only; the Silver
   view resolves every ID to its label. Renames are one-row updates, never data migrations.
3. **Typed at the source.** The single `varchar(255) value` is replaced by typed value columns.
   The database itself rejects a non-number in a numeric field, on every write path.
4. **No NULL-as-"All".** Every dimension has an explicit **All** member and the column is
   NOT NULL. (A NULL/tagged mismatch is what silently broke the Planned SAIDI formula binding.)
5. **Read down, never write up.** Bronze is written by data entry; Silver and Gold are derived,
   refreshed automatically, and read by the AI, dashboards, reports, and external tiers.
6. **Dimensions describe the fact, not the reporter.** The ledger owner is always the reporting
   utility (the row's period/utility address); dimension tags describe what the fact is *about*.
   E.g. Power Purchase Costs is the utility's expense for energy provided by others →
   provider = IPP (or Customer), never "Utility". Test: finish "…for energy provided by ___" —
   the blank is the provider tag.

---

## 1. BRONZE — raw, as entered (tables)

### 1.1 `measure_definitions` — **physically renamed** (was `input_definitions`)

**As built 2026-07-09** — the rename is done in the database and throughout the code
(services, AI tools speak `measureDefinitions` / `measure_def_id`). The trailing-space
naming defect found during the audit has been fixed; the table is exactly
`measure_definitions`.

The collapsed catalogue. One row per measure, ~55–65 rows.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | varchar | e.g. "Generation Downtime — Planned" (no dimension words) |
| variable_name | varchar | snake_case, unit-suffixed: `generation_downtime_planned_hours` |
| definition | text | plain-English dictionary definition (AI-drafted → BMO-curated) |
| synonyms | json string[] | industry alternate names |
| definition_status | varchar | `draft` \| `curated` |
| unit_id | FK managed_list | MWh, Hours, %, Currency, … |
| data_type_id | FK managed_list | `number` \| `boolean` \| `option` \| `text` — decides which value column rows use |
| category_id / subcategory_id | FK managed_list | **re-based at the collapse to classify the measure's NATURE, function-neutrally** (e.g. Costs, Network Performance, Workforce, Reliability). Old function-flavoured subcats (Generation/Transmission/Distribution/Energy Storage) dissolve into the utility_function / resource-type dimensions; "browse by function" becomes a dimension query, and Silver derives a combined display label (function · theme). Categories keep driving entry navigation and DAO role routing (§1.3 user-journey note) |
| agg_level_id | FK managed_list | finest grain the measure is entered at |
| valid_range_min / valid_range_max | **numeric** | **BUILT 2026-07-09** (were integer; ratio-stored % measures need e.g. 0–1 ranges) |
| ~~measure_type_id~~ | — | **DROPPED 2026-07-09 (same day)** — Fixed/Contextual proved to be a per-dimension property, not per-measure; the classification lives in `measure_dimension_scope.expansion_mode` (§1.3) and the measure-level label is **computed** (Contextual ⇔ any dimension is `by_context`). Managed list 62 remains as the label vocabulary |
| is_mandatory, is_active, is_calculated, formula, formula_inputs | as today | |
| sort_order, updated_at | as today | |

### 1.2 Dimension managed lists

**AS BUILT (2026-07-09): the managed-lists system was rebuilt** — a `managed_lists` parent
table (62 lists: id, name, description, is_active) with `managed_list_items` now carrying
`list_id` (NOT NULL), `parent_id` (in-list hierarchy), `energy_resource_type_id`
(items can be tagged Generator/ESS — e.g. sources), and `color`.

**The ten dimension lists and their canonical member ids (all BUILT):**

| List (id) | Members (id = name) |
|---|---|
| Energy Provider (2) | **20 = All** · 21 = Utility · 22 = IPP · **23 = Customer** (grid-connect prosumers — §5 Q6 resolved; re-id'd from 1234 on 2026-07-09, taking the id freed by the deleted "Every" member). All is always used |
| Energy Type (3) | **30 = All** · 31 = Conventional · 32 = Renewable. "Every Energy Type" deleted 2026-07-09 |
| Energy Source (4) | **40 = All GEN** · 41 = All Conventional · 42 = All Renewable · **58 = All ESS** · fuels 43–57 (Battery 43, Biomass 44, Coal 45, Diesel 46, Geothermal 47, Heavy Fuel 48, Hydro Dams 49, Hydro RoR 50, Hydro Pumped 51, Hydrogen Cells 52, Natural Gas 53, Solar 54, Wind 55, Other Conv. 56, Other Renew. 57) |
| Energy Resource Type (55; list-name typo fixed 2026-07-09) | **983 = All** (was "Nill" — renamed 2026-07-09; the canonical un-sliced default) · 984 = Generator · 985 = Energy Storage · 988 = Generator + Storage (facts genuinely about combined systems) · 1035 = Virtual (legacy workaround, unreferenced — slated for deletion post-reload, §5 Q9) |
| Customer Type (9) | **690 = All Customers** · 691 = Residential · 692 = Commercial · 693 = Industrial · 694 = Government · 695 = Streetlights · 696 = Recreational Facilities · 697 = Others |
| Payment Mode (36) | **720 = All Payment Modes** · 721 = Prepaid · 722 = Postpaid |
| Gender (52) | **1022 = All** · 930 = Male · 931 = Female |
| Division (59) | **1011 = All** · 1012 = Executive · 1013 = Technical · 1014 = Finance · 1015 = Human Resources · 1016 = Procurement · 1017 = ICT · 1018 = PR & Marketing · 1019 = Customer Services · 1020 = Administrative · 1021 = Other |
| Consumption Band (60) | **1005 = All** · 1006–1010 = Block 1–5 — positional labels; per-utility boundaries are data (a boundary measure per block), not list metadata (§5 Q8) |
| Utility Function (61) | **1023 = All** · 1024 = Generation · 1025 = Distribution · 1026 = Transmission · 1029 = Energy Storage · 1030 = Auxilliary Services |

Also new: **Measure Type (62)** — 1027 = Fixed (required from every utility regardless of
context) · 1028 = Contextual (applicability driven by the utility's context: sources, IPP
purchases, transmission network, tariff components/payment modes/customer types). See §5 Q10.

Bold ids = the canonical **All member** each dimension column defaults to. The historic ids
(20/30/40/690/720) survived the rebuild unchanged, so legacy workbook tags still map 1:1.
The old NULL-as-All rows become irrelevant under the flush-and-reload strategy (§4) — the
reload writes All ids explicitly from the first row.

### 1.3 `measure_dimension_scope` (unifies today's relevance tables) — **BUILT, table empty**

Declares how each dimension behaves for each measure — drives the entry UI and shell
generation. **Restructured 2026-07-09:** `is_applicable` (yes/no) was too coarse — whether a
measure is "fixed" or "contextual" is a property of each measure–dimension pairing, so the
column is now a three-way **`expansion_mode`**:

| expansion_mode | Meaning | Shell generation |
|---|---|---|
| `not_applicable` | dimension doesn't slice this measure | auto-fill the All member |
| `all_members` | applies identically for every utility | expand across every member unconditionally (e.g. employees × division × gender) |
| `by_context` | which members apply depends on the utility | expand only the members the utility's context activates (registry, tariff config, context data — e.g. generation × source, tariff × class/mode/band) |

Columns as built: id, measure_id, dimension, expansion_mode. Holds **0 rows** — population is
part of the catalogue-collapse work. A measure's Fixed/Contextual label (Measure Type list 62)
is **computed**: Contextual ⇔ any dimension is `by_context`. Note also the
`energy_resource_type_relevance` table (as built), scoping resource-type applicability.

**User-journey note:** Category/Subcategory continue to drive entry navigation (Finance →
Costs etc.), re-based function-neutrally at the collapse; within a section the page is a
**grid generated from the shells** (e.g. cost measures × active functions; equipment ×
generation measures; divisions × gender), so related data is entered together and the grid
is automatically the right shape per utility. DAO role routing by category and `sort_order`
sequencing continue unchanged. No separate journey taxonomy is added.

| Column | Type | Notes |
|---|---|---|
| measure_id | FK | |
| dimension | enum | provider / **type** / source / customer_type / payment_mode / band / division / gender / **utility_function** / **energy_resource_type** — one enum value per dimension column in §1.4 |
| is_applicable | boolean | |

*Example: `employees_total` → division ✓, gender ✓, all others auto-All. `tariff_rate` →
customer_type ✓, payment_mode ✓, band ✓. `electricity_generated_mwh` → provider ✓,
type ✓, source ✓.*

### 1.4 `data_entries` (redesigned)

One row = one fact, at the finest applicable grain.

All 32 physical columns below are **BUILT** on the dev DB (column names verbatim).
"Target" notes what remains to be enforced on each.

| Column (as built) | Type | As built / target |
|---|---|---|
| id | uuid PK | ✔ |
| report_period_id | FK, NOT NULL | ✔ implies FY/Monthly report type |
| **measure_def_id** | FK, NOT NULL | the measure — **physically renamed** from `input_def_id` (2026-07-09); references `measure_definitions` |
| **Hierarchy (denormalised onto the row, as built):** | | |
| utility_id · country_id · subregion_id | FK, nullable | target: backfill + NOT NULL |
| region | varchar | as built (typed string, not FK) |
| service_area_id | FK, nullable | target: NOT NULL via "All areas" member |
| power_station_id | FK, nullable | station-level grain now supported |
| energy_resource_id | FK, nullable | **mandatory for generation/storage measures** (equipment = their collection grain, §5 Q4); NULL for all other measures |
| **Ten dimensions (all BUILT, all currently nullable):** | | target: All-member backfill + NOT NULL |
| energy_provider_id | FK | default **All (20)** |
| energy_type_id | FK | default **All (30)** |
| energy_source_id | FK | default **All GEN (40)**; All ESS (58) for storage |
| energy_resource_type_id | FK | default **All (983**, renamed from Nill 2026-07-09**)**; Generator (984) / Energy Storage (985) / 988 = combined systems |
| customer_type_id | FK | default **All Customers (690)** |
| payment_mode_id | FK | default **All Payment Modes (720)** |
| consumption_band_id | FK | list + members pending |
| division_id | FK | list + members pending |
| gender_id | FK | list + members pending |
| utility_function_id | FK | list + members pending |
| **Values (BUILT; typed columns hold 0 rows until value migration runs):** | | |
| value | varchar (legacy) | **kept**: raw migrated string stays here; typed copy in the columns below |
| **value_numeric** | numeric | exact decimals; never float |
| **value_boolean** | boolean | governance Yes/No items |
| **value_option_id** | FK managed_list | option-typed measures (e.g. Electricity Regulation) |
| **value_text** | text | genuinely free text only |
| **Workflow / audit:** | | |
| status_id | FK | Requested → Pending → Entered → Reviewed → **Approved** (Endorsed retired ✔) |
| comments | json | as today |
| update_medium_id · is_relevant · is_deleted · updated_at · updated_by_id | | as today |

**Constraints — all still PENDING (none exist on the built table yet)**

- `CHECK`: at most **one** of the four typed value columns is non-null (all null = awaiting
  entry; the status column carries the why).
- **Unique address**: today `uniq_entry` is a NON-unique index over the old 8-column address
  (period, measure, area, source, provider, resource, customer, paymode). Target: a true
  UNIQUE constraint over period + area + measure + **all ten** dimension columns
  (+ energy_resource_id where used) — after the All-member backfill (NULLs break uniqueness).
- Which value column a measure uses is dictated by `data_type_id`, enforced by **one shared
  routing function** (`lib/data-entry/value-router.ts` — exists) used by every write path.

**Example rows (IDs shown as labels for readability):**

| period | area | measure | provider | type | source | cust. | pay | band | div. | gender | value_numeric | value_boolean | value_option |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EFL FY2024 | Viti Levu | electricity_generated_mwh | Utility | Conventional | Diesel | All | All | All | All | All | 48210.5 | | |
| EFL FY2024 | All areas | employees_total | All | All | All GEN | All | All | All | ICT | Female | 23 | | |
| EFL FY2024 | All areas | tariff_rate | All | All | All GEN | Residential | Prepaid | 100 kWh | All | All | 0.3421 | | |
| EFL FY2024 | All areas | code_of_conduct_implemented | All | All | All GEN | All | All | All | All | All | | true | |
| EFL FY2024 | All areas | electricity_regulation | All | All | All GEN | All | All | All | All | All | | | Price Regulation |

### 1.5 Hierarchy level — declared on the measure, expressed by the address

The level ladder is the existing managed list: Lvl_Equipment (1) · Lvl_PowerStation (2) ·
Lvl_ServiceArea (3) · Lvl_Organisation (4) · Lvl_Country (5) · Lvl_SubRegion (6) · Lvl_Region (7).
Active measures today collect at three: utility (62), service area (25), country (16).

- **Declared grain:** `measure_definitions.agg_level_id` — the level a measure is *collected* at.
  Drives shell creation (relevance pass) and the entry UI.
- **Actual level of a row = its address, not a column:** equipment → `energy_resource_id` set;
  service area → specific `service_area_id`; utility → the **All areas** member; country →
  context measures via the utility's country. There is deliberately **no level column** on
  entries — a redundant level declaration could disagree with the address (the dual-encoding
  disease again).
- **Sub-region and Region are never entry levels** — they exist only as derived rows in
  `gold.fact_kpi_rollup`.
- **Validation:** the writer rejects a row whose address grain contradicts the measure's
  declared grain (like a wrong-typed value).
- **Silver derives a readable `entry_level` label** from the address.
- **Power Station note (updated as-built):** `power_station_id` now EXISTS on entries, so
  station-level facts are addressable (row level = station when it's the deepest specific
  component). No active measure declares station grain yet; whether any should is part of
  open question 4.

### 1.6 Totals vs. details — mixed-grain measures

Some measures change grain over time (e.g. **revenue**: entered as a lump sum for four years,
unbundled by customer type × payment mode in PRISM 2). Rules:

1. **One measure, two grains.** The lump-sum rows are the same measure at the All grain
   (customer_type = All Customers 690, payment_mode = All Payment Modes 720). Never create a
   separate "total" measure.
2. **Where detail exists, the total is derived, never entered.** The per-period relevance
   matrix requests only the detail cells from the unbundling period onward; the All-cell is
   not offered. Reading rule everywhere (Silver, Gold, AI, KPI formulas at All scope):
   **total = entered All-row if present, else SUM(detail rows)**. This makes lump-sum history
   and unbundled present one continuous time series.
3. **Both present = validation tripwire.** If an entered total and detail rows coexist for one
   period (migration, transition), they must reconcile before approval — entered total ≠ sum of
   components is flagged, not silently resolved.
4. **The dictionary records the era boundary** in the measure's definition
   ("entered as a single figure through FY2024; by customer type × payment mode from FY2025").
5. **Per-utility grain is a BMO policy lever**: a utility that cannot split a measure may keep
   entering the All-row; the coalesce rule serves mixed granularity across utilities without
   special cases.

### 1.7 `data_entry_logs` (audit) — **value_snapshot BUILT**

The `value_snapshot` (jsonb) column now exists alongside `previous_value` / `new_value`,
holding a snapshot of the four typed value columns
(plus status), so audit history survives the retyping.

---

## 2. SILVER — cleaned & readable (view; BUILT)

### 2.1 `silver.data_entries_enriched`

**One row per Bronze row** — the descriptive twin. Every ID resolved to its label
(IDs retained alongside), values already typed by construction, plus derived columns:

| Adds | Derived from |
|---|---|
| utility, utility_id, country, sub_region, utility_size | period → organisation → country |
| fiscal_year, report_type (FY / Monthly) | period |
| measure, unit, category, definition_status | measure_definitions |
| all ten dimension labels | managed lists |
| is_approved | status_id ≥ Approved |
| entry_level | derived from the address (§1.5): Equipment / Service Area / Utility / Country |
| value_display | the populated value column, formatted |

*Same example row, Silver form:*
`EFL · Fiji · Melanesia · FY2024 · Viti Levu · Electricity Generated · Utility · Diesel · All · … · 48,210.5 MWh · Approved`

**As built: a plain view, not materialised** (`silver.data_entries_enriched` is live —
always current, no refresh machinery needed). At PRISM's data volume this is the right
call; materialise later only if read latency ever demands it, at which point refresh
triggers on approval events. Because Bronze is born typed, Silver contains **no casting
logic** — only joins.

---

## 3. GOLD — business-ready (views over Silver + KPI engine output)

| Object | Grain | What it adds | Example row |
|---|---|---|---|
| `gold.dim_utility` | 1 row / utility | flattened who's-who for grouping & peers | EFL · Fiji · Melanesia · Large · Government-owned |
| `gold.fact_kpi` | KPI × utility × period | **computed** results + targets, limits, industry benchmarks, meets-target flags | EFL · 2024 · System Losses · 11.8% · target 12% · ✅ |
| `gold.fact_kpi_rollup` | KPI × hierarchy level × period | rows that exist nowhere in the data: service area → utility → country → sub-region → region, and month → FY. Built by **rolling up formula inputs and re-applying the stored formula at each level** (never averaging results) | Melanesia · 2024 · System Losses · 13.2% |
| `gold.v_reporting_status` | utility × period | workflow progress: counts per status, % complete, pending-with | TPL · FY2024 · 53% complete · 85 awaiting review |
| `gold.v_bsc_alignment` | KPI ↔ initiative ↔ objective | the utility's strategy map joined to actuals, so "how are we tracking against our strategy?" is answerable | EFL · Reduce Losses (objective) · Feeder upgrade (initiative) · System Losses 11.8% vs target |
| `gold.ext_data_entries` / `gold.ext_kpi` (external slices) | as fact_kpi / rollup | the **only** surface the paid tiers see: Approved-only + per-utility visibility flag applied + KPI results only (never raw entries) | — |

*As built 2026-07-09: all Gold objects above exist as live views (`dim_utility`, `fact_kpi`,
`fact_kpi_rollup`, `v_reporting_status`, `v_bsc_alignment`, `ext_data_entries`, `ext_kpi`),
and the AI's PRISM-native tools read silver/gold.*

### 3.1 Access rules (enforced at the read layer, one place)

| Reader | Sees |
|---|---|
| Utility roles (CEO/EXE/MGR/DAO/BLO) | own utility: everything incl. Monthly + provisional (labelled) |
| BMO / DEV | cross-utility: **Financial Year data only**; Monthly never |
| Cross-utility benchmarking (any reader) | Approved-only |
| External tiers (Basic/Premium/Pay-per-project) | `gold.ext_*` only |

---

## 4. Migration approach — FLUSH AND RELOAD (decided 2026-07-09)

`data_entries` is flushed and re-migrated from source into the final shape. Consequences:
no NULL backfill is needed, and **constraints go on the empty table BEFORE loading**, so the
database enforces the rules from the first inserted row (loader bugs are rejected at insert).

1. Derive the **measure list** from the 515 classified legacy defs (the classifier workbook's
   dimension tags do most of this mechanically; name families confirm it), and map each legacy
   def → (measure, dimension tuple) — extends the existing `input_dl_def_mappings` pattern.
2. Create the new managed-list members (Consumption Band, Division, Gender, Utility Function;
   `Customer` provider; resource-type All decision).
3. **Flush `data_entries`, then apply all constraints to the empty table**: NOT NULL on every
   dimension column, the at-most-one-value CHECK, and the true UNIQUE address over
   period + area + measure + all ten dimensions.
4. **Pass 1 — relevance shells** (addresses only, status Requested), then
   **Pass 2 — values**: raw string into legacy `value`, typed copy routed by data type into
   value_numeric / value_boolean / value_option_id / value_text. Parse failures (audit found
   ~90 rows: 84 "Infinity" + placeholders) are **logged, not dropped**. The sample workbook
   (`new_data_entries_sample_v2.xlsx`) is the acceptance example for both passes.
   The stale in-place router `scripts/medallion-migrate-values.sql` is superseded — retire it.
5. **Un-costume the virtual-generator rows**: the 39,905 legacy entries hung on the 92
   "virtual generator" resources reload at their true address (the owning service area,
   `energy_resource_id` NULL); virtual generators do not reload into the equipment registry
   (§5 Q9).
6. **Every data repair must be a repeatable script in the reload pipeline** — the 2026-07-08
   fixes (customers-served dedup → input 1501, SAIFI/SAIDI re-pointing, duration-input
   activation) must be replayed by the pipeline, or the flush re-imports the original broken
   state.
7. Re-point KPI `formula_inputs` at measures + dimension filters (systematically — the SAIFI
   re-pointing exercise of 2026-07-08 is the per-KPI template for this).
8. Ripples: KPI worker reads `value_numeric` directly (deletes casting code); Excel templates
   gain dimension columns instead of dimension-suffixed rows; legacy `/api/fact*` routes keep
   parity via the mapping table.

---

## 5. Open questions for this discussion

1. ~~**`value_option_id` (4th typed column)**~~ — **RESOLVED: built** on the table; the
   value-router routes option-typed measures to it.
2. ~~**% storage convention**~~ — **DECIDED 2026-07-09: ratios (0–1) everywhere; % is a
   display format.** Original analysis kept for reference: 28 %-KPIs store ratios, 2 (Employees
   Male/Female %, ids 64/65) multiply by 100. **Recommended: ratios (0–1) everywhere; % is a
   display format** (`unit = '%' → render value × 100`). Rationale: 28-vs-2 least change;
   ratios compose through formulas without /100 factors (each forgotten one is a silent 100×
   bug); formulas naturally produce ratios; one display rule serves silver/gold/PBI/AI/reports.
   Entry UX handled at the boundary: %-unit measures show a % suffix, value-router ÷100 on
   write, ×100 on display — officers type "11.8", storage holds 0.118. Implementation: fix
   the two ×100 formulas, normalise ai_benchmark values/targets/limits to ratios in the same
   pass, and the reload's KPI recalc regenerates history consistently. (Finding 9's
   access_to_electricity 0–1 range already follows this convention.)
3. ~~**Rename `input_definitions` → `measure_definitions`?**~~ — **RESOLVED: physically
   renamed** (table + `data_entries.measure_def_id` + code); trailing-space defect fixed.
4. ~~**`energy_resource_id` grain**~~ — **RESOLVED 2026-07-09: equipment level is the
   MANDATORY collection grain for generation/storage measures** (deliberate design: utilities
   historically aggregated inconsistently, so PRISM collects raw per-equipment facts and owns
   all aggregation, standardised and transparent; utilities have entered per-equipment since
   2022 and manage their registry — commissioning/decommissioning; BLO owns data quality).
   Consequences: (a) generation/storage measures declare `Lvl_Equipment` collection level —
   a catalogue-metadata correction, since no active measure carries it today; (b) the active
   equipment registry IS the relevance source — shells generated per active unit per period;
   (c) source/type/resource-type dimensions are **inherited from the equipment's registry
   record**, not typed per row (auto-filled + validated); (d) all levels above equipment are
   derived in gold, never entered — entered aggregate rows do not reload ("raw-only"
   migration); §1.6's coalesce rule covers pre-2022 history where only totals exist.
5. **Measure count sign-off** — the ~55–65 measure list needs a DHI/BMO review pass:
   the collapse is mechanical for ~90% of defs, judgment for the rest (e.g. is "IPP Lubrication
   Oil" a measure or `lubrication_oil` × provider=IPP?).
6. ~~**Add `Customer` to the Energy Provider list?**~~ — **RESOLVED: built** (id 23).
   Grid-connect prosumer purchases tag provider = Customer per principle 6.
7. ~~**"Every …" vs "All" member semantics**~~ — **RESOLVED 2026-07-09: the "Every" members
   were deleted** (ids 23/33, verified unreferenced); **All is always used**.
8. ~~**Consumption Band boundaries**~~ — **RESOLVED (defined 2026-07-09): boundaries are
   deliberately NOT defined globally** — they differ widely by utility. Block 1–5 are
   positional labels; the band dimension records *which block* a fact relates to, and the
   value column carries the utility-specific figure — including the block's own boundary,
   which is itself a measure (e.g. `tariff_block_threshold_kwh` @ Block 1 = 75 for one
   utility, 100 for another; `tariff_rate` @ Block 1 = that utility's lifeline rate).
   **Entry collects structure only; cross-utility comparability is computed at the KPI
   level** (e.g. tariff-impact KPIs deriving the charge for a reference consumption from
   each utility's own blocks) — never by comparing raw block inputs directly.
9. ~~**Energy Resource Type extras**~~ — **RESOLVED 2026-07-09.** `Nill` renamed to All (983,
   the canonical un-sliced default). `Virtual` (1035) is a **legacy workaround**: under the old
   structure, fake "virtual generators" were created to carry service-area/utility-level values
   through the equipment slot — 92 exist (one per area), and **39,905 entries (most of the
   data) hang on them**. The new address ladder makes this obsolete (area-level fact =
   area set, resource NULL). Consequences: **(a) migration rule** — entries on virtual
   resources reload at their true address (the virtual resource's area, `energy_resource_id`
   NULL); the 92 virtual generators do not reload into the registry; **(b)** the `Virtual`
   member (currently unreferenced) is **slated for deletion post-reload** once confirmed
   unused.
10. ~~**Measure Type list (Fixed 1027 / Contextual 1028)**~~ — **RESOLVED (defined
    2026-07-09):** catalogues whether a measure's applicability depends on the utility's
    context. **Contextual (1028)** = applies according to the utility's situation — its
    generator energy sources, whether it buys from IPPs, whether it has a transmission
    network, and which tariff components / payment modes / customer types operate there.
    **Fixed (1027)** = required from every utility regardless of context.
    **REFINED (same day):** the classification proved to be **per measure–dimension pairing,
    not per measure** (e.g. `employees` expands division × gender for everyone, while
    `tariff_rate` expands only the combos the utility operates). It therefore lives in
    `measure_dimension_scope.expansion_mode` (§1.3: not_applicable / all_members /
    by_context); `measure_definitions.measure_type_id` was dropped, and the measure-level
    Fixed/Contextual label is **computed** (Contextual ⇔ any dimension `by_context`), with
    managed list 62 serving as the label vocabulary.
11. **"Not Available" status vs. value** — status 7 (Not_Available) continues to mean
   "no value exists"; confirm nothing should ever write a sentinel into the value columns.

---

## 6. What this buys (recap)

- **AI readability:** one dictionary entry per measure (~60, not 245+); every question becomes
  the same query shape (measure + dimension filters); no name-matching ambiguity.
- **Data quality at the gate:** the DB rejects wrong-typed values on every write path;
  the "Infinity" class of defect becomes impossible.
- **Simplicity downstream:** Silver is joins-only; Gold rollups are natural aggregations;
  Power BI and the report engine read the same shelves the AI does.
- **One migration, not two:** the legacy data lands once, into the shape everything else
  was designed for.
