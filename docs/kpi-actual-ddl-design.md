# `kpi_actual` DDL design (DRAFT)

_Status: DRAFT — 2026-08-12, session #4 (data_entries / shared-table DDL owner).
The single computed-KPI table. Synthesises #3's calculator-engine spec (purpose +
column-set), #8's hybrid nullable-chain grain convention (address model), and the
existing `data_entries` shape (which it mirrors). For ratification by #8 (grain) +
#3 (column-set/write-path) before DDL._

Owners: **#4** DDL (this doc) · **#3** column-set-merge + write path (sole writer) ·
**#8** grain convention · **#12** RLS owning-org column.

---

## 1. Purpose (from calc-spec §4.4)

`kpi_actual` holds **computed** KPI values where `data_entries` holds **entered**
ones, on the **same grain convention**, so an input cell's address and an output
cell's address share one scheme. The calculator is its **sole writer** (one
computed-KPI table — NOT a separate `fact_kpi`); BSC/target/AI streams read it.
It is the **one place coarse-grain (rolled-up) computed values live**.

## 2. Column set

Mirrors `data_entries` (post-`no_data_reason`), swapping measure→KPI and adding
compute provenance:

| group | columns |
|---|---|
| **identity** | `id` (uuid PK), `kpi_def_id` → `kpi_definitions`, `period_id` |
| **nullable grain chain** (7, per #8) | `utility_id`, `country_id`, `subregion_id`, `region`, `service_area_id`, `power_station_id`, `unit_id` — filled level→root, NULL below |
| **derived grain** | `grain_level` — **generated stored** from the deepest non-NULL grain col (§4) |
| **10 dimension slices** (NOT NULL, explicit All) | `provider_id`, `category_id`, `technology_id`, `asset_class_id`, `customer_type_id`, `payment_mode_id`, `consumption_band_id`, `division_id`, `gender_id`, `utility_function_id` |
| **value** | `value numeric` (nullable — NULL when not-available) |
| **availability** | `no_data_reason varchar(32)` — **shared vocab** `{not_available, asserted_not_applicable}`, **derived-only** (propagated by the engine from input states; never a direct KPI-level assertion — sole-writer enforces) |
| **provenance** | `computed_at timestamp`, `formula_version varchar`, RLS **`owning_org_id`** (#12, derivable at write) |
| **audit** | `updated_at` |

Note vs the legacy `kpi` table (`actual_value varchar NOT NULL`, `is_relevant`,
`is_favourite`, `target_value`): `kpi_actual` is the **typed, medallion** successor.
Targets live separately (`kpi_target`); limit bands / `meets_target` / within-band
are **gold-layer evaluations, not stored here** (calc-spec §… confirmed).

## 3. Constraints

- **Unique address, `NULLS NOT DISTINCT`** on `(kpi_def_id, period_id, ⟨7 grain⟩,
  ⟨10 dims⟩)` — one computed cell per address (grain cols nullable; higher-grain
  rows dedupe correctly).
- **`chk_value_xor_nodata`** — a row is a value XOR a no-data answer:
  `(value IS NOT NULL)::int + (no_data_reason IS NOT NULL)::int <= 1` (mirror
  `data_entries`).
- **`chk_no_data_reason`** — `no_data_reason IS NULL OR IN ('not_available','asserted_not_applicable')`.
- **No sentinels, ever** — a rolled-up row addresses the *real* parent entity;
  "All Countries" etc. are computed aggregates, never stored addresses.
- **Chain-consistency** — the nullable chain is filled from the row's level up to
  the root; **#4 enforces chain-consistency on the write contract** (Eugene-confirmed
  grain rule). FKs on every grain + dimension + `kpi_def_id`.

## 4. `grain_level` (generated) — needs #8's exact vocabulary

`grain_level` is a **generated stored** column = the deepest non-NULL grain level.
The calc-spec lists five levels (`unit|station|area|utility|country`) but the chain
has **seven** columns (incl. `subregion_id`, `region`). **Open for #8:** the exact
level vocabulary + ordering (do `subregion`/`region` get their own levels, or fold
into `country`?), so the `CASE` is authoritative:
```
grain_level GENERATED ALWAYS AS (
  CASE WHEN unit_id IS NOT NULL THEN 'unit'
       WHEN power_station_id IS NOT NULL THEN 'station'
       WHEN service_area_id IS NOT NULL THEN 'area'
       WHEN utility_id IS NOT NULL THEN 'utility'
       WHEN region IS NOT NULL THEN 'region'          -- ? per #8
       WHEN subregion_id IS NOT NULL THEN 'subregion' -- ? per #8
       WHEN country_id IS NOT NULL THEN 'country'
       ELSE 'global' END) STORED
```

## 5. Dependencies / open items

- [ ] **#8 — grain ratify:** the `grain_level` vocabulary/ordering (§4), the
      nullable-chain + `NULLS NOT DISTINCT` + chain-consistency mirror. (Should
      `data_entries` also gain the generated `grain_level`? It doesn't have it today
      — worth aligning both.)
- [ ] **#3 — column-set-merge + write path:** confirm `value` is a single `numeric`
      (are any KPIs boolean/text? if so, typed columns like `data_entries`), and the
      exact 10-dimension merged set matches the input side. Confirm `no_data_reason`
      is derived-only in the write path.
- [ ] **#12 — RLS:** the `owning_org_id` column + policy (tenant derivable via the
      grain chain → utility).
- [ ] **`period_id` = the canonical period dimension** (time-series spec) — a
      per-utility `report_period_id` can't key a country rollup. `kpi_actual`'s
      `period_id` waits on / aligns with the canonical period dim. Flag the sequencing.
- [ ] **DDL execution** — additive greenfield table; lands in the coordinated
      medallion DDL (or early, Eugene's call) once #8/#3/#12 ratify the above.

## 6. Ownership recap

`#4` writes/owns this DDL · `#3` owns the write path + column-set-merge + per-reason
engine behaviour · `#8` owns the grain convention it must obey · `#12` owns the RLS
column. Value + no_data_reason mirror `data_entries` (already landed).
