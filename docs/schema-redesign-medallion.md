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
> **~~PENDING~~ CONSTRAINTS BUILT 2026-07-22** — `data_entries` was flushed (57,391 rows
> snapshotted to `backup.data_entries_backup_20260722`) and all three constraints applied to
> the empty table, encoded in the Drizzle model so `db push` no longer reverts them:
> (1) `chk_one_value` CHECK — at most one of the four typed value columns non-null;
> (2) NOT NULL on all ten dimension columns (All-member, never NULL); (3) `uniq_entry_address`
> UNIQUE **NULLS NOT DISTINCT** over the **full 17-column physical address** —
> period + measure + grain (utility, country, service_area, power_station, energy_resource) +
> the ten dimensions. This **extends the literal spec** below (period + area + measure + 10 dims):
> grain columns are included because a NULL "area" alone cannot distinguish two utilities, or a
> utility- vs country-level row; `NULLS NOT DISTINCT` makes NULL grains deduplicate. The old
> non-unique 8-column `uniq_entry` index was dropped. `measure_dimension_scope` /
> `measure_dimension_applicability` are populated. (Catalogue has since evolved through the
> 2026-07-23 curation passes — see `docs/measure-catalogue-changelog.md`; current: **117 measures /
> 115 active, 1,170 scope, 75 applicability**.)
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
| unit_id | FK managed_list | MWh, Hours, %, Currency, … — NOT NULL always; measures with no unit point at the explicit **Units N/A** member (90), never NULL. Hygiene rule for the collapse: Units N/A is legitimate only for boolean/option/text data types — a **number** measure must carry a real unit (flag number+N/A combos in the sign-off workbook; e.g. audit found Depreciation Expense mis-united as "Number" instead of Currency). Display rule: Silver/UI render nothing for Units N/A |
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
| **Category (3)** *(was "Energy Type")* | **30 = All** · 31 = Conventional · 32 = Renewable · **99717 = Storage** (added 2026-07-23). Parents → asset: Conventional/Renewable → Generation (984), Storage → Storage (985), All → All (983) |
| **Technology (4)** *(was "Energy Source")* | **40 = All** *(was "All GEN")* · leaves parent-linked to category: [Renewable] Solar 54, Wind 55, Hydro Dams 49, Hydro RoR 50, Geothermal 47, Biomass 44; [Conventional] Diesel 46, Coal 45, Heavy Fuel 48, Natural Gas 53; [Storage] Battery 43, Hydro Pumped Storage 51, Hydrogen Cells 52. **Deleted 2026-07-23:** All Conventional (41), All Renewable (42), All ESS (58), Other Conventional (56), Other Renewable (57) — fake aggregates + unused catch-alls |
| **Asset (55)** *(was "Energy Resource Type")* | **983 = All** · 984 = **Generation** *(was Generator)* · 985 = **Storage** *(was Energy Storage)* · 988 = Generator + Storage (inactive) · 1035 = Virtual (legacy, slated for deletion §5 Q9) |
| Customer Type (9) | **690 = All** · 691 = Residential · 692 = Commercial · 693 = Industrial · 694 = Government · 695 = Streetlights · 696 = Recreational Facilities · 697 = Others |
| Payment Mode (36) | **720 = All** · 721 = Prepaid · 722 = Postpaid |
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

### 1.2a Energy dimension taxonomy — settled + APPLIED 2026-07-23

> **Data pass done 2026-07-23** — Storage category created (id **99717**); ESS technologies
> reparented to Storage; All GEN → All; Generator → Generation, Energy Storage → Storage; lists
> relabelled Category / Technology / Asset; `category → asset` parents set; members 41/42/56/57/58
> deleted; relevance orphans cleaned. Backups in `backup.*_pre_taxonomy`. External p1→p2 map fixed
> in the same pass (ESS rows filled `category = Storage`; the unused Other Conv/Renew references
> scrubbed and unmapped). Labels/columns rule below held — DB columns + dimension keys unchanged.

The three energy dimensions form a **technology hierarchy** (`asset → category → technology`),
with the physical instance as a fourth, registry-level concept. **Renamed labels only — DB columns
and the internal dimension string keys (`resource_type` / `type` / `source`) stay unchanged**, so
scope/applicability data, `MEASURE_DIMENSIONS`, the migration code, and the formula builder are
untouched. Only managed-list names, UI labels, the AI dictionary, and these docs change.

| new label | old label | column (unchanged) | key (unchanged) | values |
|---|---|---|---|---|
| **asset** | resource_type | `energy_resource_type_id` | `resource_type` | Generation, Storage |
| **category** | energy type | `energy_type_id` | `type` | Renewable, Conventional, **Storage** |
| **technology** | energy source | `energy_source_id` | `source` | Solar, Diesel, Battery, … |
| **unit** | (energy) resource | `energy_resource_id` | — (grain) | the specific generator/battery instance |

`asset` is the coarse rollup of `category` (Renewable/Conventional → Generation; Storage → Storage);
`category` is the parent of `technology` via `managed_list_items.parent_id`. So picking a technology
derives its category (Solar → Renewable), and picking `category = Renewable, technology = All` means
"all renewable technologies" — a **computed** rollup of the leaves, never a stored aggregate member.

**Storage is its own category.** ESS technologies (Battery, Hydro Pumped Storage, Hydrogen Cells)
reparent from Renewable → Storage. Storage is not sub-classified (only three technologies; extend
later via new parent categories if a reporting need appears). This deliberately does **not** classify
the renewability of *stored* energy — that's a round-trip accounting question, not a technology attribute.

**Member cleanup (the structural data pass — DONE 2026-07-23):**
- **Delete** the fake aggregate members — All Renewable (42), All Conventional (41), All ESS (58) —
  and the catch-alls Other Renewable (57), Other Conventional (56). They looked like sums but never
  computed one; "all X" is now expressed as a category filter + `technology = All`.
- **Rename** All GEN (40) → **All** (the single generic un-sliced technology member).
- **Rename** members: Generator → Generation, Energy Storage → Storage (the `asset` values).
- **Reparent** Battery/Hydro Pumped Storage/Hydrogen Cells → Storage category.
- **Clean** orphaned `energy_resource_type_relevance` rows; re-point `energy_resources` off removed
  members (the 92 on All GEN are the virtual units already slated for deletion, §5 Q9).
- **Pre-req:** confirm the external p1→p2 map pins none of the deleted source ids (41/42/56/57/58);
  any that do must be re-pointed to `category = <Renewable|Conventional>, technology = All` first.

**Handling `All` in the hierarchy.** Each list keeps exactly **one** genuine `All` member —
asset 983, category 30, technology 40 — chained by `parent_id` (technology All → category All →
asset All). `All` means "not sliced at this level" and is stored on a row only where the measure's
scope makes that dimension `not_applicable`. When a measure IS sliced, rows store the specific leaf
plus its **denormalized parents** (a Coal row = technology Coal, category Conventional, asset
Generation — never `All`). Every "all of category X" is expressed as the **combination**
`category = X, technology = All` and summed from the leaves in Gold — there is **no** stored
per-category aggregate member (that is exactly what the deleted All Renewable / All Conventional /
All ESS were). The single retained `technology = All` carries "don't pin a technology"; the category
dimension does the renewable/conventional/storage scoping.

**Measure "category" → "group" (renamed 2026-07-23, to avoid clashing with the energy `category`
dimension).** Because `category` now names the energy dimension (was `type`), the *measure's*
grouping was renamed everywhere: physical columns `measure_definitions.category_id →
measures_group_id`, `subcategory_id → measures_subgroup_id`; Drizzle fields likewise; the ~104 code
references; and the managed lists **12 → "Measures Group"**, **13 → "Measures Subgroup"**. Full
rename (field + column + refs), verified by `tsc`. Backup `backup.measure_definitions_pre_grouprename`.

### 1.3 `measure_dimension_scope` (unifies today's relevance tables) — ~~**BUILT, table empty**~~ **BUILT + POPULATED (1,170 rows; DB-verified 2026-07-26)**

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

**Constraints — BUILT 2026-07-22 (applied to the empty table, encoded in the Drizzle model)**

- ✅ `chk_one_value` `CHECK`: at most **one** of the four typed value columns is non-null
  (all null = awaiting entry; the status column carries the why).
- ✅ **Unique address** — `uniq_entry_address` `UNIQUE NULLS NOT DISTINCT` over the full
  17-column physical address: period + measure + grain (utility_id, country_id, service_area_id,
  power_station_id, energy_resource_id) + **all ten** dimension columns. Fuller than the original
  target (period + area + measure + 10 dims) because a NULL "area" cannot by itself distinguish
  two utilities or a utility- vs country-level row; `NULLS NOT DISTINCT` (PG 15+) makes NULL
  grains deduplicate instead of the default "every NULL is unique" (which would let duplicates
  through). The old non-unique 8-column `uniq_entry` index was dropped.
- ✅ **NOT NULL** on all ten dimension columns — every entry carries the explicit **All** member,
  never NULL (no NULL-as-All). The RAW-ONLY reload must COALESCE legacy NULL dims → All-member.
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

## 3B. RELEVANCE & SHELL GENERATION — context is truth, expected inputs are computed (decided 2026-07-22)

Replaces the three legacy relevance tables (`input_relevance`, `tariff_relevance`,
`transmission_relevance`) — which stored a hand-curated "which measures apply" list that drifted
and made the required-input count unreliable. **The count is now computed, not stored.**

### 3B.1 The principle
> **expected inputs (utility, period) = for each active measure, expand its `by_context`
> dimensions across the intersection of (catalogue applicability members ∩ the utility's context).**

The count is `|that set|` — deterministic, cannot drift, fully explainable (every shell traces to
a measure × a context fact). Fixed measures generate a constant shell set; Contextual measures
expand only what the utility's context activates.

### 3B.2 Three ingredients (clean separation of rules vs facts)

| Ingredient | Level | Holds | Status |
|---|---|---|---|
| `measure_dimension_scope` | catalogue | WHICH dimensions slice a measure (not_applicable / all_members / by_context) | ✅ built |
| **`measure_dimension_applicability`** (NEW — keystone) | catalogue, BMO-maintained | WHICH members are valid per by_context dimension | ⏳ to build |
| **Context profile** | per-utility, per-period | WHAT the utility has — registry, areas, tariff structure, flags | mostly exists |

`measure_dimension_applicability` (measure_id, dimension, member_id) is the missing structure that
answers "which measures apply to which member". No rows for a (measure, dimension) = all members
valid. Examples: Fuel Oil→source∈{Diesel,Heavy Fuel,Natural Gas,Coal}; Solar Irradiance→source∈{Solar};
Fuel & Oil Expenditure→source∈{Diesel,Heavy Fuel}; Direct Costs Staffing/O&M + FTE Employees→
utility_function∈{Generation,Transmission,Distribution}; Electricity Purchased→provider∈{IPP,Customer}.

### 3B.3 Context facts, per driver
- **Other providers (IPP/Customer):** derived from `energy_resources` (each resource is classified by
  provider). A non-utility provider in the registry activates purchase measures, expanded by
  provider × source.
- **Transmission network:** a yes/no flag. Activating it generates shells for every measure whose
  applicability includes `utility_function = Transmission` — the list comes from the CATALOGUE, never
  from a previous period (so a brand-new utility gets the correct set). NB: transmission activation
  also adds Direct Costs: Staffing, Direct Costs: O&M, and FTE Employees at the Transmission function.
- **Generators/storage:** the `energy_resources` registry (source/provider/type/resource_type per unit)
  drives generation/storage shells; applicability restricts which measures apply to which source.
  **Per-period resource state already exists** as `energy_resources.period_entries` (jsonb array of
  `{is_active, capacity_mw, report_period_id}`): units are added/decommissioned over time and can be
  derated within a period. Only active-this-period units get shells; Rated Capacity comes from
  `period_entries.capacity_mw` (editable per period) and feeds the generation energy-balance
  validation (`docs/data-entry-ux-requirements.md` §6–7). NB: `capacity_mw` is currently often NULL
  — must be populated for the balance check.
- **Tariffs:** see 3B.5.

### 3B.4 The BLO journey — confirm CONTEXT, not measures
On a new period: clone last period's context profile as the baseline → notify BLO → modal walks
context categories (service areas, generators, storage, tariffs, transmission) asking "same as last
period, or changed?". Changes edit the context profile (registry add/retire, tariff structure, flags).
On completion, shells regenerate from confirmed context and land in `data_entries` as Requested.
The BLO never picks measures from a list — which is why the count was previously wrong.

### 3B.5 Tariff structure & entry (fool-proofed)
The BLO declares, per (customer_type × payment_mode) offered: **the number of RATES N** (+ whether a
fixed monthly charge applies). Shell generation then produces: **N** Tariff Rate shells (Block 1..N),
**N−1** Tariff Block Limit shells (Block 1..N−1 — the final rate is unbounded), 1 Fixed Charge (All),
1 VAT/GST Rate (utility-level). BLOs never select tariff measures individually (they skipped Block
Limits), and blocks present themselves at entry from the declared rate count.

Two entry rules that must be enforced in the UI (see `docs/data-entry-ux-requirements.md`):
- **Block limits are CUMULATIVE from zero**, not incremental. Entry shows the lower bound auto-filled
  (0, then the previous limit) read-only; only the cumulative upper bound is keyed; strictly-increasing
  validation.
- **Rates/charges are entered TAX-EXCLUSIVE** (VAT/GST is a separate measure). Entry shows the
  tax-inclusive figure live (rate × (1 + tax rate)) for verification against the published rate;
  tax rate is collected before rates in the journey.

### 3B.6 Consequence for migration
The three legacy relevance tables are **decommissioned, not migrated** — replaced by scope +
applicability + context profile + the generation function. Clearing them at flush time is correct.

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
3. **Flush `data_entries`, then apply all constraints to the empty table** — ✅ **DONE
   2026-07-22**: 57,391 rows snapshotted to `backup.data_entries_backup_20260722`; NOT NULL on
   all ten dimension columns, `chk_one_value` CHECK, and `uniq_entry_address` UNIQUE NULLS NOT
   DISTINCT (full 17-column address) applied and encoded in the Drizzle model (see §1.4).
4. **Pass 1 — relevance shells** (addresses only, status Requested), then
   **Pass 2 — values**: raw string into legacy `value`, typed copy routed by data type into
   value_numeric / value_boolean / value_option_id / value_text. Parse failures (audit found
   ~90 rows: 84 "Infinity" + placeholders) and any constraint rejection are **recorded in the
   rejection ledger, never dropped** (§4.1). The sample workbook
   (`new_data_entries_sample_v2.xlsx`) is the acceptance example for both passes.
   The stale in-place router `scripts/medallion-migrate-values.sql` is superseded — retire it.
   **RAW-ONLY (decided 2026-07-22): migrate only ENTERED (raw) values. Calculated measures**
   (is_calculated=true — Total Costs, Profit, and any calculated inputs) **are NOT migrated;
   the new formula engine + gold rollups recompute them.** This also removes migrated computed
   aggregates as a source of total-vs-detail conflict.
5. **Un-costume the virtual-generator rows** (§5 Q9): the ~39,905 raw entries on the 92 virtual
   generators re-home at their true LEVEL, deterministically by the virtual generator's
   `agg_level_id` — 66 ServiceArea-level → `service_area_id` + `energy_resource_id` NULL; 26
   Utility-level → the utility's "All areas" area + resource NULL. Virtual generators do NOT
   reload into the equipment registry. **Flag total-vs-detail collisions** (§1.6): recent
   periods where a re-homed aggregate coexists with real equipment-level entries for the same
   measure → surface for BMO reconciliation (small set; historical periods usually have only
   the aggregate).
6. **Every data repair must be a repeatable script in the reload pipeline** — the 2026-07-08
   fixes (customers-served dedup → input 1501, SAIFI/SAIDI re-pointing, duration-input
   activation) must be replayed by the pipeline, or the flush re-imports the original broken
   state.
7. Re-point KPI `formula_inputs` at measures + dimension filters (systematically — the SAIFI
   re-pointing exercise of 2026-07-08 is the per-KPI template for this). **Do the "formula
   engine v2: scoped operands" upgrade in the same pass** (decided 2026-07-09): formula
   tokens become per-OPERAND aliases (auto-generated from variable_name + scope), because one
   measure can appear multiple times with different dimension scopes (audit finding 5's
   `electricity_generated / electricity_generated` is the proof). Bindings extend from
   provider/type/source to all ten dimensions; the formula builder gains a measure+scope
   operand picker validated against `measure_dimension_scope`; aggregation stays with the
   platform (worker at finest scope, gold rollups re-apply formulas over summed inputs) —
   never in the builder. `variable_name` remains the readable token base / default alias and
   the dictionary‑AI handle; it is no longer the whole formula contract.
8. Ripples: KPI worker reads `value_numeric` directly (deletes casting code); Excel templates
   gain dimension columns instead of dimension-suffixed rows; legacy `/api/fact*` routes keep
   parity via the mapping table.

### 4.1 Rejection ledger — iterate until clean (added 2026-07-22)

Migration is **iterative**: the load runs, some data points are rejected, we diagnose and fix
(source data, mappings, or loader), and re-run — repeating until zero (or only knowingly-accepted)
rejections remain. Every rejected data point is recorded so nothing is silently lost.

- **Table:** `migration_rejections` (model `db/schema/migrationRejections.ts`). **One row per
  rejected source data point**, capturing: the full attempted record (`source_payload` jsonb) and
  a pointer back to it (`source_system` + `source_ref`); readable target context (measure, period,
  utility); and the diagnosis — `failure_category`, **`failure_columns` (which column[s])**,
  `failure_reason` (why), `failure_rule` (the constraint/validation id), and **`remediation`
  (what to do to fix it)**. It has **no FKs / CHECKs / NOT NULLs** by design — an error log must
  accept anything, or a bad row could be rejected twice and vanish.
- **Load run identity:** each run is a row in **`migration_loads`** (model `migrationLoads.ts`)
  whose serial `id` is the auto-incrementing **`load_id`** stamped on every rejection and
  scorecard row. `startLoad()` (`lib/migration/loads.ts`) mints it and resets the per-run
  ledgers (`TRUNCATE migration_rejections`; clear this load's scorecard rows); `finishLoad()`
  closes it with status + roll-up counts. load_id keeps climbing across runs even though the
  rejection table is truncated each run.
- **How the loader records:** validate-then-insert; on a caught Postgres error, `classifyPgError()`
  maps the error code → category + implicated column(s) (23502 not_null, 23514 check, 23505
  unique, 23503 fk, 22P02/22003 type_cast), and `recordRejection({ loadId, p1ReportPeriodId,
  stage, intendedValueType, attemptedNumeric, … })` writes the row. `stage` ("shell" | "value"),
  `p1_report_period_id`, `intended_value_type` and `attempted_numeric` are what let the scorecard
  (§4.2) attribute failures per period / stage / value type and balance the numeric sum.
- **Between iterations:** query the ledger grouped by `failure_category` / `measure_name` /
  `failure_columns` to see the failure classes, fix the largest first, re-run.

### 4.2 Scorecard — balance the books, per report_period (added 2026-07-23)

The **`migration_scorecard`** (model `migrationScorecard.ts`) is the control-total reconciliation,
keyed **per (load_id × report_period)** so every period balances on its own (no offsetting errors
hiding in a grand total). Grain confirmed with the customer: report_period.

**Source of the numbers.** The migration is p1 → p2. The customer produces, independently in p1,
a **control-totals sheet** (one row per report_period; template
`Migration/Decisions/migration_control_totals - template.xlsx`, generator
`scripts/gen-control-totals-template.ts`): relevance count, value counts by type, Σ value_numeric,
the **unfiltered** non-calc count, and the calculated count. Because relevance is applied as the
p1 **extraction filter**, orphan values (no relevance record) are dropped before we see them — the
`values_noncalc_unfiltered` column is the only way they surface, so it is required.

**Two stages, reconciled per period** (`reconcilePeriod(loadId, controlTotals)` reads the migrated
side from `data_entries` and the failed side from `migration_rejections`, so the scorecard reflects
reality, not the loader's self-report):

| recon_line | identity (balance_expected) |
|---|---|
| `shell` | relevance_records = shells_created + shells_failed |
| `value` (× numeric/boolean/text/option/total) | values_in = migrated + failed |
| `value_sum` (numeric) | Σvalue_numeric_in = Σmigrated + Σfailed — **independent failed sum catches a silently corrupted migrated value** |
| `leak` | variance = unfiltered − relevance-matched = **orphans** (flag if > 0) |
| `fill` *(informational)* | RAW shells only — variance = empty shells **awaiting entry** (someone must key a value) |
| `calc_shell` *(informational)* | calculated shells — variance = shells **awaiting computation** (p2 calculator fills them) |
| `excluded` *(informational)* | calculated-value count from the control sheet (computed in p2, not migrated) |

Calculated measures get a shell (so `shell` balances) but never a migrated value, so their empty
shells are split OUT of `fill` (awaiting *entry*) into `calc_shell` (awaiting *computation*) via
`measure_definitions.is_calculated` — the two "empty" reasons are then distinguishable.
`variance` (= source − migrated − failed), `is_balanced` and `balance_expected` are **generated
columns**. **Anomaly report = `balance_expected AND NOT is_balanced`** (`getAnomalies(loadId)`) —
so fill/calc_shell/excluded never false-flag. `getScorecardSummary(loadId)` rolls up across periods.
Merges are **upstream** (the p1 extract is already merged into p2 measures), so no merge line is
needed. Orphans are **flagged, not hard-stopped**: the customer decides fix (→ another load run)
or accept. End-to-end verified 2026-07-23 (balanced shell/value/value_sum; leak correctly the sole
flagged anomaly; fill/excluded correctly informational).

### 4.3 Loader (added 2026-07-23)

The extract is **pre-resolved to p2 ids** (customer decision 2026-07-23): each row carries
`report_period_id` (unchanged p1↔p2), `measure_id`, the 10 dimension member ids, and the physical
grain — all resolved during extraction via the p1→p2 map. So the loader does **no map / period /
grain resolution**; relevance + values arrive in **one file** (a row with a value = filled shell,
without = empty shell). Input contract: `ExtractRow` in `lib/migration/types.ts`.

- **`lib/migration/load.ts` — `loadExtract(loadId, rows)`**: per row, two steps — insert the SHELL
  (address only), then fill the VALUE if present. Splitting the steps keeps the scorecard's two
  stages clean (shell failure = address problem; value failure = typing problem). Value column comes
  from the measure's `data_type`; a mismatch vs the extract's `valueType` is a `value_router` rejection.
- **Calculated measures get a SHELL, not a value.** They are part of the relevance/expected set
  (so `relevance_records` includes them and the per-utility shell balance holds), but their value is
  **computed in p2 by a calculator, never migrated** — so Pass 2 leaves the shell empty; a value
  present on a calculated row is logged stage-less and dropped. **Inactive** measures are skipped
  entirely (no shell — not collected). All exclusion logging is **stage-less** so it never distorts
  the shell/value identities. (Reporting note: calculated shells count as "empty" on the `fill`
  line — awaiting *computation*, distinct from raw measures awaiting *entry*; separable via
  `is_calculated` / the control sheet's `values_calculated` if we want the split.)
- **`lib/migration/rejections.ts` — `classifyPgError`** unwraps Drizzle's wrapped error (`.cause`)
  to read the real pg `code` (23502 not_null, 23514 check, 23505 unique, 23503 fk, 22P02/22003
  type_cast) → category + columns + rule.
- **`lib/migration/map.ts`** loads/validates the p1→p2 map (dl_def → measure + dims). Used to
  regenerate `input_dl_def_mappings` for the legacy fact API — NOT in the load path.
- End-to-end proven 2026-07-23 (synthetic): shells, value fills, every rejection class, scorecard
  reconciliation, clean teardown.
- **Remaining:** the `xlsx → ExtractRow[]` parser + `scripts/migrate.ts` CLI (pending a sample
  extract to fix the column layout); `input_dl_def_mappings` regeneration from the map.

### 4.4 Calculator — designed in a SEPARATE session

The calculator (computes calculated inputs + KPIs) is being designed in its own session, not here.
It **depends on** decisions made in this thread:
- **Calculated measures get empty shells** at migration (§4.3); the calculator fills them post-load
  — that is the `calc_shell` scorecard line (§4.2).
- **Energy taxonomy** (§1.2 / §1.2a): the `asset → category → technology` hierarchy, the single-`All`
  semantics, denormalized parents per row, and the `parent_id` chains — formula-input **context
  filters** resolve against exactly this structure.
- **Context filters are the scope-alignment mechanism**: `FormulaInput` generalizes to pin any of the
  10 dimensions; an unpinned dimension resolves to its `All` member.
- Reuse-and-refactor base: the existing `aggregated-worker` (multi-pass fixpoint over calculated
  inputs) + `kpi-worker` (`filterAffectedKpiTargets` reactive recompute), unified into one engine.

Direction (from the design discussion, for that session to carry forward): one **reactive engine**
over a single dependency DAG with two node kinds (`calculated_input` → `data_entries`; `kpi` →
`kpi` table, terminal); targets/trajectory live in the KPI benchmark/BSC setup, **not** the formula
builder; persisted formula **test cases** re-run on every formula change.

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
12. **Downtime split — equipment vs network grain (2026-07-22)** — the 4 Downtime measures
   (Planned/Unplanned × Events/Hours) each carried two incompatible grains: a generating-unit
   outage (equipment) and a T&D-network outage (function). One measure cannot be both `agg_level 1`
   (per generator, sliced by provider/type/source) and `agg_level 3` (per utility_function). Each was
   **split into two measures**: **Generator …** (reuses the original id; `agg_level 1`; scope drops
   utility_function, keeps provider/type/source/resource_type `by_context`; applicability
   resource_type=Generator) and **Network …** (new ids 1911–1914; `agg_level 3`; scope only
   utility_function `by_context`; applicability utility_function∈{Transmission, Distribution}).
   Catalogue count **114 → 118 measures**; scope 1,180 rows (118×10); applicability 72 rows.
   *(Superseded 2026-07-23: Generator→Equipment rename + storage broadening, Network ids
   1911–1914 renumbered to 340–343, and other curation — see `docs/measure-catalogue-changelog.md`.
   Current catalogue: 117 measures / 115 active.)*
   The DB is now the source of truth — `scripts/rebuild-enriched-from-db.ts` +
   `scripts/workbooks-from-json.ts` regenerate the JSONs/workbooks from it (never re-derive).

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
