# PRISM 2 — Database Build Specification (for the database builder)

**Companion to** `docs/schema-redesign-medallion.md` · 2026-07-09
**See also** `docs/data-entry-ux-requirements.md` (entry error-prevention patterns: block-limit
range entry, tax-exclusive tariff entry, BLO context journey) and spec §3B (relevance & shell
generation: context profile + measure_dimension_applicability + the computed expected-input count).
**See also** `docs/data-entries-configuration-guide.md` + `scripts/configure-data-entries.sql`
(the phased execution guide: Phase A = safe today, Phase B = migration day). This document
is the WHAT and WHY per column; that one is the DO-IT-IN-THIS-ORDER runbook — they agree.
**Audience:** the person configuring the tables. Plain-language instructions with exact SQL.
**Golden rule throughout:** address columns always hold an id (the "All" member when not
sliced); value columns are NULL until answered; nothing meaningful is ever expressed as NULL
in an address column.

---

## 1. Order of operations (dependencies — do these IN THIS SEQUENCE)

Nothing here is optional; each step depends on the one before it.

| # | Step | Why it must come before the next |
|---|---|---|
| 1 | Managed lists + members exist (DONE on dev: all ten dimension lists incl. All members; canonical ids in §3) | every dimension column's foreign key points at these rows |
| 2 | `measure_definitions` finalised (collapse: ~60 measures, re-pointed subcategories, Tier-4 columns retired) | entries and scope rows point at measures |
| 3 | `measure_dimension_scope` populated (one row per measure × dimension, expansion_mode set) | shell generation reads it |
| 4 | **Flush `data_entries`** (planned migration-day step) | constraints in step 5 can only be applied to an empty/clean table |
| 5 | Apply constraints to `data_entries` (§4 below) | the reload in step 6 is then validated row-by-row by the database itself |
| 6 | Reload: relevance shells, then values | — |
| 7 | KPI recalculation + silver/gold verification | regenerates everything derived |

---

## 2. `data_entries` — column-by-column configuration

### 2.1 Address columns (19) — "which fact is this?"

Every dimension column: `integer`, **NOT NULL** (after flush), **FK → managed_list_items(id)**,
**default = its All member id**. The default means a plain insert that doesn't mention the
column automatically gets "All" — blanks become impossible.

| Column | FK target | NOT NULL? | Default | Notes |
|---|---|---|---|---|
| report_period_id | report_periods(id) | YES | — | carries the utility + FY/Monthly type |
| utility_id | organisations(id) | YES (backfill from period at reload) | — | denormalised for query speed |
| country_id | countries(id) | YES (from utility) | — | denormalised |
| subregion_id | sub_regions(id) | YES (from country) | — | denormalised |
| region | varchar | YES | 'Pacific' | plain text by design |
| service_area_id | service_areas(id) | YES | — | utility-level facts use the utility's "All areas" area |
| power_station_id | power_stations(id) | no | NULL | only when the row is at station grain or below |
| energy_resource_id | energy_resources(id) | no | NULL | **required by application rule** for generation/storage measures (equipment is their collection grain); NULL for all other measures. Not DB-enforceable simply — the entry service + value-router enforce it |
| measure_def_id | measure_definitions(id) | YES | — | the measure |
| energy_provider_id | managed_list_items(id) | YES | **20** (All) | |
| energy_type_id | managed_list_items(id) | YES | **30** (All) | |
| energy_source_id | managed_list_items(id) | YES | **40** (All GEN) | |
| energy_resource_type_id | managed_list_items(id) | YES | **983** (All) | |
| customer_type_id | managed_list_items(id) | YES | **690** (All Customers) | |
| payment_mode_id | managed_list_items(id) | YES | **720** (All Payment Modes) | |
| consumption_band_id | managed_list_items(id) | YES | **1005** (All) | |
| division_id | managed_list_items(id) | YES | **1011** (All) | |
| gender_id | managed_list_items(id) | YES | **1022** (All) | |
| utility_function_id | managed_list_items(id) | YES | **1023** (All) | |

### 2.2 Value columns (5) — "what's the answer?"

All nullable, no defaults. A row with all five NULL = awaiting entry (status says why).

| Column | Type | Holds |
|---|---|---|
| value | varchar(255) | the raw legacy string, kept verbatim from migration (audit trail) |
| value_numeric | numeric | number-typed measures (exact decimals — never float). Percentages stored as ratios 0–1 |
| value_boolean | boolean | Yes/No measures |
| value_option_id | integer, FK → managed_list_items(id) | option-typed measures (the chosen item's id) |
| value_text | text | genuinely free-text measures only |

Which one a row uses is dictated by the measure's `data_type_id`, enforced by the shared
value-router (`lib/data-entry/value-router.ts`) on every write path — and belt-and-braces by
the CHECK constraint below.

### 2.3 Workflow / housekeeping (8)

| Column | Config |
|---|---|
| id | uuid PK, default gen_random_uuid() |
| status_id | integer; 1 Requested · 2 Pending · 3 Entered · 4 Reviewed · 5 Approved · 7 Not Available (6 Endorsed retired) |
| is_relevant | boolean NOT NULL default true |
| is_deleted | boolean NOT NULL default false |
| comments | json |
| update_medium_id | integer FK → managed_list_items(id), nullable |
| updated_at | timestamp NOT NULL default now() |
| updated_by_id | text FK → "user"(id), nullable |

---

## 3. Canonical dimension member ids (reference card)

All (provider) = 20 · Utility = 21 · IPP = 22 · Customer = 23
All (type) = 30 · Conventional = 31 · Renewable = 32
All GEN = 40 · All ESS = 58 · All Conventional = 41 · All Renewable = 42 · fuels 43–57
All (resource type) = 983 · Generator = 984 · Energy Storage = 985 · Generator + Storage = 988
All Customers = 690 · classes 691–697
All Payment Modes = 720 · Prepaid = 721 · Postpaid = 722
All (gender) = 1022 · Male = 930 · Female = 931
All (division) = 1011 · members 1012–1021
All (band) = 1005 · Block 1–5 = 1006–1010
All (function) = 1023 · Generation = 1024 · Distribution = 1025 · Transmission = 1026 · Energy Storage = 1029 · Auxilliary Services = 1030

---

## 4. Keys and constraints on `data_entries` (apply at step 5, on the empty table)

Exact SQL, in order:

```sql
-- 4.1  One typed value at most (all-NULL = awaiting entry)
ALTER TABLE data_entries ADD CONSTRAINT chk_one_value
  CHECK (num_nonnulls(value_numeric, value_boolean, value_option_id, value_text) <= 1);

-- 4.2  Address columns can never be blank + get their All defaults
ALTER TABLE data_entries
  ALTER COLUMN energy_provider_id      SET DEFAULT 20,   ALTER COLUMN energy_provider_id      SET NOT NULL,
  ALTER COLUMN energy_type_id          SET DEFAULT 30,   ALTER COLUMN energy_type_id          SET NOT NULL,
  ALTER COLUMN energy_source_id        SET DEFAULT 40,   ALTER COLUMN energy_source_id        SET NOT NULL,
  ALTER COLUMN energy_resource_type_id SET DEFAULT 983,  ALTER COLUMN energy_resource_type_id SET NOT NULL,
  ALTER COLUMN customer_type_id        SET DEFAULT 690,  ALTER COLUMN customer_type_id        SET NOT NULL,
  ALTER COLUMN payment_mode_id         SET DEFAULT 720,  ALTER COLUMN payment_mode_id         SET NOT NULL,
  ALTER COLUMN consumption_band_id     SET DEFAULT 1005, ALTER COLUMN consumption_band_id     SET NOT NULL,
  ALTER COLUMN division_id             SET DEFAULT 1011, ALTER COLUMN division_id             SET NOT NULL,
  ALTER COLUMN gender_id               SET DEFAULT 1022, ALTER COLUMN gender_id               SET NOT NULL,
  ALTER COLUMN utility_function_id     SET DEFAULT 1023, ALTER COLUMN utility_function_id     SET NOT NULL,
  ALTER COLUMN service_area_id         SET NOT NULL,
  ALTER COLUMN utility_id              SET NOT NULL,
  ALTER COLUMN country_id              SET NOT NULL,
  ALTER COLUMN subregion_id            SET NOT NULL,
  ALTER COLUMN region                  SET DEFAULT 'Pacific', ALTER COLUMN region SET NOT NULL;

-- 4.3  One row per complete address (replaces the old non-unique uniq_entry index)
DROP INDEX IF EXISTS uniq_entry;
CREATE UNIQUE INDEX uniq_entry_address ON data_entries (
  report_period_id, service_area_id, measure_def_id,
  energy_provider_id, energy_type_id, energy_source_id, energy_resource_type_id,
  customer_type_id, payment_mode_id, consumption_band_id,
  division_id, gender_id, utility_function_id,
  COALESCE(energy_resource_id, 0)          -- equipment grain participates; NULL treated as one bucket
) WHERE is_deleted = false;

-- 4.4  Helpful query indexes (the views and AI read these paths constantly)
CREATE INDEX idx_entries_period_measure ON data_entries (report_period_id, measure_def_id) WHERE is_deleted = false;
CREATE INDEX idx_entries_utility        ON data_entries (utility_id, report_period_id)     WHERE is_deleted = false;
CREATE INDEX idx_entries_status         ON data_entries (status_id)                        WHERE is_deleted = false;
```

Foreign keys for the dimension columns (add once, any time before reload):

```sql
ALTER TABLE data_entries
  ADD CONSTRAINT fk_de_provider  FOREIGN KEY (energy_provider_id)      REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_etype     FOREIGN KEY (energy_type_id)          REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_esource   FOREIGN KEY (energy_source_id)        REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_ertype    FOREIGN KEY (energy_resource_type_id) REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_custtype  FOREIGN KEY (customer_type_id)        REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_paymode   FOREIGN KEY (payment_mode_id)         REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_band      FOREIGN KEY (consumption_band_id)     REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_division  FOREIGN KEY (division_id)             REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_gender    FOREIGN KEY (gender_id)               REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_function  FOREIGN KEY (utility_function_id)     REFERENCES managed_list_items(id),
  ADD CONSTRAINT fk_de_valueopt  FOREIGN KEY (value_option_id)         REFERENCES managed_list_items(id);
```

(Several FKs already exist from the Drizzle schema — `ADD CONSTRAINT` will error on
duplicates; check `pg_constraint` first or use the runbook script, which is idempotent.)

---

## 5. Relationships between tables (what points at what)

```
managed_lists ──< managed_list_items          (every list member)
                        ▲     ▲
measure_definitions ────┘     │   (unit, data_type, category, subcategory, agg_level,
        ▲   ▲                 │    polarity, trend → all list members)
        │   └── measure_dimension_scope       (one row per measure × dimension; expansion_mode)
        │
data_entries ── measure_def_id ───────────────► measure_definitions
data_entries ── 10 dimension ids ─────────────► managed_list_items (All members as defaults)
data_entries ── report_period_id ─────────────► report_periods ──► organisations ──► countries ──► sub_regions
data_entries ── service_area_id ──────────────► service_areas
data_entries ── power_station_id ─────────────► power_stations
data_entries ── energy_resource_id ───────────► energy_resources (the equipment registry;
                                                 registry rows carry provider/type/source —
                                                 entry dims for equipment rows are INHERITED from it)
data_entries ── value_option_id ──────────────► managed_list_items
data_entry_logs ── data_entry_id ─────────────► data_entries (cascade delete)
silver.data_entries_enriched / gold.* ────────  read-only views over all of the above
```

The one **application-level** relationship (not DB-enforceable as a simple constraint):
for measures whose `agg_level` = Equipment, the entry service must require
`energy_resource_id` and copy provider/type/source/resource-type from the equipment's
registry record. This lives in the entry service + value-router, with a reconciliation
check in the reload verification.

---

## 6. `measure_definitions` — target column set (~21) after the collapse

**variable_name derivation (built 2026-07-09, `lib/formatters.deriveMeasureVariableName`):**
auto-derived at creation as slugified name + unit suffix — no retyping. Rules:
Units N/A → **no suffix** (never `_na`); `%` → `_pct`; suffix skipped when the name already
ends with it; **derived once and then FROZEN** — renaming a measure does NOT re-derive the
variable_name, because formulas reference the token (the old rename-re-derivation bug is
fixed). For the collapse, author variable_names in the sign-off workbook using the same
rules; the helper generates them for all future BMO-created measures.

Keep: id, name, variable_name, definition, synonyms, definition_status,
category_id, subcategory_id, unit_id (Units N/A member for unit-less measures — never NULL),
data_type_id, **option_list_id** (FK -> managed_lists; source list for option-typed measures,
set only when data_type = managedLists — replaces the fragile measure-name==list-name
convention; e.g. Gender of CEO/2IC -> list 52. Built 2026-07-10),
agg_level_id, sort_order, valid_range_min/max (numeric),
valid_polarity_id, valid_trend_id, is_active, is_mandatory,
is_calculated + formula + formula_inputs, is_currency, updated_at.

Retire at the collapse (merge content where noted): description (→ definition),
alternative_names (→ synonyms), is_descriptive, is_aggregated, is_kpi, is_kpi_input,
is_system_generated, service_relevance_group_id, utility_service_id.

`measure_dimension_scope`: id, measure_id (FK → measure_definitions),
dimension, expansion_mode. **Constraints — ALL IN PLACE on dev (2026-07-09):**
- `mds_dimension_valid` — dimension must be one of the canonical ten:
  `provider · type · source · resource_type · customer_type · payment_mode · band ·
  division · gender · utility_function` (use these exact strings when populating)
- `mds_expansion_mode_valid` — expansion_mode ∈ ('not_applicable','all_members','by_context')
- `uq_scope` — UNIQUE (measure_id, dimension): one row per pairing

---

## 7. What can be configured NOW vs at migration day

**Now (safe on the live dev table):** the scope-table constraints (§6 SQL — table is empty),
the missing dimension FKs, the query indexes.

**Migration day only (needs the flush first):** everything in §4.1–4.3 — the NOT NULLs and
the unique address would be violated by today's legacy rows (45k NULL dimensions, duplicate
scopes), so they go on the freshly emptied table, then the reload runs against them.

The runbook script `scripts/medallion-flush-and-constrain.sql` (companion to this document)
performs §4 in order and is written to be re-runnable.
