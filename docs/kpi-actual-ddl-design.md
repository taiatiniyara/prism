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

## 4. `grain_level` (generated) — #8 RATIFIED (authoritative)

`grain_level` is a **generated stored** column = the deepest non-NULL grain level.
**#8 ruled subregion + region get their own levels on `kpi_actual`** — because it is
the rollup store, and supra-country rollups (sub-region / region) "exist only as
derived rows in gold" (medallion §1.5) = exactly this table. They were dropped from
`data_entries` because they are never *entry* levels, but they are *rollup* levels.
Authoritative 7-level CASE (finest→coarsest, matching the managed-list ladder Lvl 1–7):
```
grain_level GENERATED ALWAYS AS (
  CASE WHEN unit_id IS NOT NULL THEN 'unit'
       WHEN power_station_id IS NOT NULL THEN 'station'
       WHEN service_area_id IS NOT NULL THEN 'area'
       WHEN utility_id IS NOT NULL THEN 'utility'
       WHEN country_id IS NOT NULL THEN 'country'
       WHEN subregion_id IS NOT NULL THEN 'subregion'
       ELSE 'region' END) STORED
```
Four conditions (#8), enforced on the write contract:
- **(a) supra-country rows are engine-only** — no *entered* fact ever sits above
  country; the calculator's sole-writer status enforces this mechanically.
- **(b) chain-consistency extends two more hops:** `country_id` filled ⇒
  `subregion_id` = that country's real `sub_region` FK **and** `region` = that
  sub-region's continental region; `country_id` NULL ⇒ `subregion_id` is a real M49
  row (FK suffices — no sentinels) with `region` consistent.
- **(c) `region` as a typed string** is acceptable *here only* (region-level rollup
  addresses need it; no region entity table exists) — it must always equal the
  derivable value where `subregion_id` is filled, **validated at write**.
- **(d)** since the chain fills to root, **`region` is effectively `NOT NULL`** on
  every row — declare it `NOT NULL` explicitly.

### 4.1 Shared `grain_level` on BOTH tables (#8 ruled)

`data_entries` gets the **same generated `grain_level`** (this was refinement (ii) of
the hybrid grain ruling — "generated col or Silver field, choice"; `kpi_actual`
choosing generated-stored settles it). **One derivation definition, one type** shared
by both tables — zero drift. **Type = `text` + CHECK** (7 values), settled with #8 —
*not* a pg enum: the generated CASE can only ever emit the 7 values (the CHECK is
belt-and-braces documentation), so an enum buys nothing but `ALTER TYPE` pain, while
`text` keeps the derivation portable across both tables and any silver re-derivation. `data_entries`' CASE is
simply the **5-branch prefix** (its chain stops at country, so it never yields
`subregion`/`region`). The `data_entries.grain_level` add lands in the **coordinated
`data_entries` DDL** (§5).

## 5. Dependencies / open items

- [x] **#8 — grain RATIFIED** (2026-08-12): 7-level `grain_level` CASE + 4 conditions
      (§4); `data_entries` gets the same generated col (5-branch prefix), shared
      derivation + type. Address model / NULLS NOT DISTINCT / no-sentinels / XOR /
      derived-only vocab all verified faithful.
- [ ] **`data_entries.grain_level`** — new DDL item (from #8's Q2): add the same
      generated-stored `grain_level` (5-branch prefix) + one shared 7-value type, +
      make `region NOT NULL` with the write-time region==derivable validation
      (§4 c/d). Lands in the **coordinated `data_entries` DDL**.
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
