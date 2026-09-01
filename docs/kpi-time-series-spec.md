# PRISM 2 — KPI targets & actuals: time-series model (spec)

**Status:** **approved** (design locked by Eugene 2026-07-24; not built) · **Owner stream:** #2 (migration) authored; cross-stream reconciliation with **#8** (submissions) and **#5/#9** (BSC targets) resolved in §8 — each stream implements its portion.

> **Naming (renamed in this design).** Today's `report_periods` table becomes **`submissions`** (`report_period_id` → `submission_id`) — it's a utility's *reporting instance* (a work-order: requested → entered → reviewed → approved), **not** the time axis (that's now `period`). Its **`report_type`** (FY/Monthly = granularity) and **`report_date`** (which encoded the period) both **fold into `period`** (`kind` + `period_start`/`period_end`) and are **dropped** from the submission — so there is no `submission_type`. The submission keeps only its own genuine fields: `utility_id`, `period_id`, `request_date`, `status_id`, `who_id`, and a submitted/approved date. The physical rename lands with the period-rework implementation (pre-migration window — coordinate with #8).

## 1. Problem

`submission_id` is the current universal anchor for both targets (partly) and actuals. But `submissions` conflates **three concerns**:

1. a **point on a time axis** (`report_date` + `report_type`),
2. a **submission event** (a utility *reported* — `status_id`, `who_id`, `request_date`),
3. the **utility** (`utility_id`).

Consequences that break target-setting:
- **Targets are forward-looking; submissions aren't.** Anchoring a target to a `submission_id` needs that submission row to exist — but targets are set for future, un-reported periods. Pre-creating submission rows for future years invents submissions that never happened.
- **One anchor forces one cadence.** A `submission` is the utility's *collection* cadence; BSC tracking frequency and benchmark *publish* frequency may differ.
- **Cross-utility benchmarking needs a shared bucket**, which a per-utility submission id doesn't provide.

Tell-tale: the BSC spec §5 already keys targets by `(utility_id, year, month?)` JSON — not `submission_id` — while actuals (`kpi` table) still key by `submission_id`. **Targets and actuals must share one axis.**

## 2. Decision

1. Introduce a canonical **`period`** dimension (time buckets, decoupled from submissions) as the single shared axis.
2. **`submission` references a `period`** (a submission *for* a bucket); `data_entries` stay on `submission` — the medallion is untouched, this is purely additive above it.
3. **Targets and actuals are relational time-series** keyed by `(kpi, utility, period)` — `kpi_target` and `kpi_actual`. Retire the JSON target arrays.
4. **Every measure/KPI declares a time-aggregation semantic** (flow / stock / ratio) — the rule that lets targets, collection, and publishing sit at different granularities and still reconcile.
5. **Actuals are computed, not entered** — the calculator/gold rolls `data_entries` up to the bucket.

## 3. The `period` dimension

Utility-agnostic for calendar granularities; fiscal-year buckets are shared across utilities with the same FY-end.

| column | notes |
|---|---|
| `id` | pk |
| `kind` | `financial_year` \| `month` \| `quarter` (month/quarter modelled but dormant — see §6) |
| `fy_year` | the fiscal year label (e.g. 2024) — for FY buckets; also the benchmark alignment key |
| `fy_end_month` | 1–12 — for FY buckets (distinguishes a 30-Sep FY from a 31-Dec FY of the same `fy_year`) |
| `period_start`, `period_end` | explicit dates — the roll-up window; handles FY≠calendar-year |
| `label` | "FY2024", "2024-03" |

- A utility maps to its FY period via **`organisations.financial_year_end`** → `fy_end_month`.
- **Benchmark / BSC align on `fy_year` (the label).** Two utilities' "FY2024" are *different calendar windows* (Oct-23→Sep-24 vs Jan-24→Dec-24) but compare as the same fiscal year — standard utility benchmarking. Calendar-aligned comparison is a deliberately-not-chosen alternative.

## 4. Targets — `kpi_target`

`{ kpi_def_id, utility_id, period_id, value, updated_by, updated_at }`, unique `(kpi_def_id, utility_id, period_id)`.

- **Forward-datable** — insert against any future `period`; no submission needed.
- **One store, two entry points.** The KPI settings screen and the BSC Builder both write here. The BSC Builder's "N periods × frequency" simply **generates the period set** (creating buckets if absent) and seeds empty `kpi_target` rows — those are the BLO's "columns". (Consistent with the spec's "same shared store", made relational.)
- **Trajectory** (increase/decrease/same) stays per `(utility, kpi)` — `kpi_target_trajectory` already models this; it's a summary hint, complementary to the rows.
- **Limits/thresholds** likewise per `(utility, kpi)` (or per `(utility, kpi, period)` if they vary).

## 5. Actuals — `kpi_actual`

`{ kpi_def_id, utility_id, period_id, actual_value, calculated_at, formula_version }`, unique `(kpi_def_id, utility_id, period_id)`.

- A **materialized read-model**, recomputed by the calculator/gold from `data_entries` (which are anchored to `submission` → `period`) rolled up to the bucket per §7. Not hand-entered.
- Target vs actual is a trivial join on `(kpi, utility, period)`.

## 6. Financial year is (currently) the only live granularity

`organisations.is_mth_reports_relevant` is **FALSE for all utilities** — none report monthly today. So:
- **FY buckets, generated per utility from `financial_year_end`, are the only ones in play now.** `month`/`quarter` are modelled in `period.kind` but dormant until the flag flips for a utility.
- Data state (2026-07-24): `financial_year_end` populated for **19 utilities** (clean month-ends), **10 remain NULL** (VU blank in source + non-listed utilities incl. the "All Utilities" placeholder — accepted out-of-scope for now; those utilities can't have FY periods generated until set).

### 6.1 When monthly switches on (`is_mth_reports_relevant = TRUE`)

Monthly is not a bolt-on — it's the same axis at a finer grain. Flipping the flag for a utility lights up existing structure; nothing in the schema changes.

1. **The calendar gains `kind = month` rows** — plain calendar months ("2024-03" = 1–31 Mar). Unlike FY buckets, **calendar months are identical for every utility**, so month `period` rows are shared (not per-utility).
2. **The FY window *contains* its months.** A utility's FY period spans 12 monthly buckets; the roll-up window (from its `financial_year_end`) decides which 12 — a Sep-end utility rolls Oct→Sep, a Dec-end utility rolls Jan→Dec.
3. **Targets:** BSC Builder frequency = monthly → a column per month → `kpi_target` rows on monthly periods (same flow as annual).
4. **Actuals:** a `submission` per month (→ its month `period`); `data_entries` per month; the calculator writes a monthly `kpi_actual`.
5. **Annual figure = months rolled up through the FY window** per the §7 rule (sum for flow, last for stock, recompute for ratio). The benchmark/BSC reads whatever granularity it publishes at.

Mixed-frequency cases: collect-monthly/publish-annually → months roll to the FY bucket; **annual target + monthly actuals** → actuals accumulate toward the yearly target (a natural "on track?" view, no monthly target needed); **monthly target + only annual data** → "no monthly actual", never fabricated (can't roll *down*).

## 7. Additivity / roll-up rule

**Where it's categorised and stored:** a new column **`time_aggregation`** on the definition tables — **`measure_definitions.time_aggregation`** (raw + calculated measures) and **`kpi_definitions.time_aggregation`** (KPIs). One value per measure/KPI (`flow` | `stock` | `ratio`).

- **Set once, at definition/curation time by the BMO**, as a fixed property of what the measure *means* — right alongside `unit_id`, `data_type_id`, `valid_polarity_id`. **Not** per-`data_entries` row and **not** per-period; the raw entries stay untouched, the rule lives on the catalogue.
- The `unit` is a strong hint (MWh→flow, MW→stock, %→ratio) but not reliable enough to derive from — hence an explicit column.
- **This is the *time* roll-up rule specifically**, distinct from the *spatial* roll-up (`agg_level_id`: equipment→station→utility). The two axes can differ for the same measure — e.g. rated capacity is `sum` across equipment (space) but `last` across time (a semi-additive stock). `time_aggregation` governs only month→quarter→year.

| kind | example | roll-up across sub-periods (time) |
|---|---|---|
| **flow** | MWh generated, revenue | **sum** |
| **stock** | rated capacity, customers at period-end | **last / point-in-time** (or average) |
| **ratio** | losses %, SAIDI | **recompute from rolled-up components** — never average a ratio |

- Rolling **up** (finer collection → coarser target/publish) is deterministic via the rule.
- Rolling **down** is impossible (monthly target, only annual data) → surface as "no finer actual available", never fabricate.

## 8. Cross-stream reconcile — concrete resolution (reviewed against built artifacts 2026-07-24)

The `period` dimension is the **shared prerequisite**; build it first, jointly. Then each stream folds in.

### 8.1 Time axis — vs #8 (nothing built yet)
- **Decision:** the `period` dimension owns granularity + start/end + FY-per-utility. `submissions` gets a **`period_id` FK** — it does **not** get its own start/end/granularity columns (supersedes #8's stated plan; one time model, not two).
- **#8's level-anchor `data_entries` rework is orthogonal** (it decides *which entity* a row belongs to — WHERE — not WHEN) and proceeds independently. Only the submissions time-enrichment defers to `period`.

### 8.2 Targets — vs #5/#9 (two structures built)
- **`bsc_kpi_target_plan` (0026) stays as the *plan*** — the BLO's "frequency × N periods" intent per `(utility, kpi)`. But its embedded `periods` JSON **resolves to `period` rows** (generated from `frequency` + the utility's FY-end), rather than being a private time store. It becomes the *generator/selector* of the period set + the Preview's completeness source.
- **`kpi_definitions.targets` JSON (values) → relational `kpi_target(kpi_def_id, utility_id, period_id, value)`** — same data, now on the shared axis and joinable with actuals. All targets are **test data**, so this is a clean rebuild, not a data migration.
- **Preserve the BSC principles verbatim:** one shared store (Settings→KPI and BSC Builder both write `kpi_target`), inline-editable, no per-period structural versioning, trajectory stays per `(utility, kpi)` in `kpi_target_trajectory`. Only the *storage shape* changes (JSON → relational + a real period axis). BSC spec §5 gets a wording update, not a reversal.

### 8.3 Actuals — vs the `kpi` table (built, submission-anchored)
- **`kpi` table → `kpi_actual(kpi_def_id, utility_id, period_id, actual_value, calculated_at, formula_version)`** — re-anchored from `submission_id` to `period_id`, and **computed** from `data_entries` rolled up per §7 (not hand-entered). Target is **not** duplicated on the actual row — it lives in `kpi_target`; target-vs-actual is a join on `(kpi, utility, period)`.

### 8.4 Build order
1. **`period` dimension** (joint — #2/#8/#5) — the shared axis; FY buckets from `organisations.financial_year_end`.
2. `submissions.period_id` FK (#2/#8).
3. `kpi_target` relational + `bsc_kpi_target_plan.periods` → period refs (#5/#9).
4. `kpi_actual` + the roll-up compute (calculator/gold — #3 dependency).

**Ownership note:** this resolution is authored by #2 for Eugene to drive across streams; #5/#9 and #8 implement their portions. Flagged on the board.

## 9. Data-hygiene dependencies

- **Retype `organisations.financial_year_end`** — a free-text `varchar` invited "32 December". Target: a structured FY-end (month int 1–12, plus day if non-month-end FYs ever occur). Populate the remaining NULLs where in scope.
- All existing target/actual rows are **test data** — no migration needed; build the new shape clean.

## 10. Out of scope / open

- Monthly/quarterly buckets (dormant until `is_mth_reports_relevant` flips).
- FY-ends for the 10 NULL utilities.
- Whether any utility has a non-month-end FY (affects whether day is needed on `financial_year_end`).
- Calendar-aligned (vs fiscal-year-label) cross-utility comparison — not chosen; revisit only if a benchmark demands it.
