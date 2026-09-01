# data_entries — Database Builder's Configuration Guide

**For:** the database builder · **Status:** ready to execute · 2026-07-09
**Companion file:** `scripts/configure-data-entries.sql` — every instruction below as
copy-paste SQL, in the right order.

---

## 0. Read this first: the two phases

The configuration is split into two phases, and the split is not optional:

- **PHASE A — safe today.** Rules on the *empty* `measure_dimension_scope` table, plus
  verification. Nothing touches `data_entries` yet.
- **PHASE B — migration day only, immediately after the flush.** The strict rules on
  `data_entries` (never-empty columns, defaults, the uniqueness key, the one-value check)
  can only be switched on when the table is empty. Applied today they would either be
  rejected by the ~52,000 legacy rows (which contain empty dimension cells) or — worse —
  create silent duplicates by treating "empty" and "All" as different addresses while both
  kinds of rows coexist. **Do not run Phase B against a non-empty table.**

Phase B's position in the migration-day sequence (spec §4):
**flush data_entries → PHASE B → load shells → load values → recalculate KPIs → verify.**

---

## 1. Dependencies — what must exist before Phase B runs

All of these already exist on dev (verified 2026-07-09). The same must be true on any
other environment before Phase B:

| Dependency | Why | Status dev |
|---|---|---|
| `managed_lists` / `managed_list_items` with the canonical **All members**: provider All=20, type All=30, source All GEN=40, resource-type All=983, customer All Customers=690, payment All Modes=720, band All=1005, division All=1011, gender All=1022, function All=1023 | they are the column DEFAULTs below | ✅ |
| `measure_definitions` (populated with the condensed measure set) | every entry row points at a measure | table ✅ / condensed set pending sign-off |
| `report_periods`, `organisations`, `countries`, `sub_regions`, `service_areas`, `power_stations`, `energy_resources` | address targets | ✅ |
| The 21 foreign keys on `data_entries` | already created | ✅ |
| `measure_dimension_scope` populated (Phase A rules applied) | shell generation reads it | structure ✅ / rows pending collapse |

---

## 2. PHASE A — apply today

### 2.1 `measure_dimension_scope` rules (table is empty → safe)

1. **Only valid dimension names.** The `dimension` column may only contain one of the ten
   dimension names. (CHECK constraint — see SQL §A1.)
2. **Only valid expansion modes.** `expansion_mode` may only be `not_applicable`,
   `all_members`, or `by_context`, and may not be empty. (CHECK — SQL §A2.)
3. **One row per measure per dimension.** A measure can't declare the same dimension twice.
   (UNIQUE on measure_id + dimension — SQL §A3.)

Already in place (no action): primary key; foreign key to `measure_definitions`
(with cascade delete — deleting a measure removes its scope rows).

---

## 3. PHASE B — migration day, on the freshly-flushed table

Run in this order. Each step's SQL is in the companion file (§B1–§B5).

### B1. Defaults — "if a dimension isn't specified, it means All"

Set a DEFAULT on each of the ten dimension columns, pointing at its All member id
(the table in §1). Plain-English effect: any writer that omits a dimension gets the
explicit All id — the "blank means All" ambiguity becomes impossible to recreate.

| Column | DEFAULT |
|---|---|
| energy_provider_id | 20 |
| energy_type_id | 30 |
| energy_source_id | 40 |
| energy_resource_type_id | 983 |
| customer_type_id | 690 |
| payment_mode_id | 720 |
| consumption_band_id | 1005 |
| division_id | 1011 |
| gender_id | 1022 |
| utility_function_id | 1023 |

### B2. Never-empty rules (NOT NULL)

Make the ten dimension columns above **NOT NULL**, plus: `service_area_id`, `utility_id`,
`country_id`. (`report_period_id` and `measure_def_id` already are.)

Stay **nullable by design**: `energy_resource_id` (only equipment-grain rows use it),
`power_station_id`, `subregion_id` (not every country has one), `region`, all four value
columns, `status_id`, and the housekeeping columns.

### B3. The one-value rule (CHECK)

At most **one** of `value_numeric`, `value_boolean`, `value_text`, `value_option_id` may be
filled on a row. All four empty = a shell awaiting entry (the status column says why).
The legacy `value` column is exempt — it carries the raw migrated string alongside the
typed copy.

### B4. The address key (UNIQUE)

One row per complete address. Postgres 15 syntax (this DB is 15.8):

```
UNIQUE NULLS NOT DISTINCT (report_period_id, service_area_id, measure_def_id,
  energy_resource_id, energy_provider_id, energy_type_id, energy_source_id,
  energy_resource_type_id, customer_type_id, payment_mode_id, consumption_band_id,
  division_id, gender_id, utility_function_id)
```

Why `NULLS NOT DISTINCT` matters: `energy_resource_id` is legitimately empty on non-equipment
rows, and without this clause Postgres would treat every empty as unique — allowing infinite
duplicates of area-level rows. With it, two rows with the same address and both
resource-empty collide, as they should.

Also: **drop the old `uniq_entry` index** (it is a non-unique 8-column leftover) — SQL §B4.

### B5. Verification queries

The companion file ends with read-only checks the builder should run after Phase B:
constraint inventory, a deliberate-duplicate insert that must FAIL, a wrong-type insert
that must FAIL, and an omitted-dimensions insert that must succeed with All ids filled.

---

## 4. Relationships map (all already configured — reference only)

`data_entries` — 21 foreign keys, the ones that matter daily:

| Column | Points at | Meaning |
|---|---|---|
| report_period_id | report_periods.id | which utility + period (restrict delete) |
| measure_def_id | measure_definitions.id | which measure |
| service_area_id | service_areas.id | where |
| power_station_id / energy_resource_id | power_stations.id / energy_resources.id | finest grain |
| utility_id / country_id / subregion_id | organisations / countries / sub_regions | denormalised address |
| the ten dimension columns | managed_list_items.id | which slice |
| value_option_id | managed_list_items.id | the chosen option, for option-typed measures |
| update_medium_id / status_id | managed_list_items.id / (status enum) | workflow |
| updated_by_id | user.id | audit |

Elsewhere: `measure_dimension_scope.measure_id → measure_definitions.id` (cascade);
`measure_definitions` classification columns → `managed_list_items.id`;
`energy_resources → power_stations / service_areas / organisations`;
`report_periods → organisations`; `data_entry_logs.data_entry_id → data_entries.id` (cascade
— flushing entries clears the log, by design).

---

## 5. What NOT to do

- **Never run Phase B on a non-empty table** (§0).
- **Never write text into a dimension column** — ids only; names live in the views.
- **Never put a sentinel in a value column** ("N/A", 0-for-missing) — empty + status is the
  correct representation of "no value".
- **Never re-add a stored measure-level Fixed/Contextual flag or a per-row level column** —
  both are computed from data that already exists (scope rows / the address).
