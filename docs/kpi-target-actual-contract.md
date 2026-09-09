# KPI `kpi_actual` ⋈ `kpi_target` — shared address contract

_Status: **DESIGN RATIFIED** (Eugene, 2026-09-09). **Build gated** on the canonical
period dimension + Eugene prioritising the calculator's `kpi_actual` write path.
Nothing in this document is built yet. Authored by **#3** (calculator engine, owner
of the shared address contract per the ownership ruling below)._

Origin: the #4 Power BI governed-fact thread (`gold_fact_value`, PRs #397/#399)
surfaced that computed KPI **actuals** and utility **targets** must share one
address scheme to be comparable at grain — and that targets are currently trapped
in `kpi_definitions.targets` JSON with no provenance. This is the ratified
resolution. Refines [kpi-time-series-spec.md](kpi-time-series-spec.md) §8; pairs
with [kpi-actual-ddl-design.md](kpi-actual-ddl-design.md) (#4).

---

## 0. What this contract is

Computed KPI **actuals** live in `kpi_actual` (the calculator is its sole writer;
DDL applied, empty). Utility **targets** will live in a relational `kpi_target`
(replacing the `kpi_definitions.targets` JSON). The two are compared by an
**exact-address row join** — so they must share **one address scheme**. This
document fixes that shared scheme and the rules each side obeys.

**The shared address (both tables carry it, identically):**

| part | columns |
|---|---|
| identity | `kpi_def_id`, `period_id` |
| grain chain (7, per #8) | `utility_id`, `country_id`, `subregion_id`, `region`, `service_area_id`, `power_station_id`, `unit_id` — filled level→root, NULL below |
| derived grain | `grain_level` — generated stored, deepest non-NULL grain col |
| 10 dimension slices (NOT NULL, explicit All) | `provider_id`, `category_id`, `technology_id`, `asset_class_id`, `customer_type_id`, `payment_mode_id`, `consumption_band_id`, `division_id`, `gender_id`, `utility_function_id` |
| governance | `owning_org_id` |

**The time key is the canonical PERIOD DIM — never `report_periods`** (#4's
constraint). Targets are routinely set for **future** periods, before any
submission / `report_period` row exists, so `kpi_target` cannot reference
`report_periods` at all. Both facts must FK the **same** period dim or
actual ⋈ target misaligns. This is why the period dim is the true build gate.

Everything **outside** the address is per-table (§3 vs §4) — status lives on
actuals, provenance lives on targets.

---

## 1. Ownership (ruled by Eugene, 2026-09-09)

| concern | owner |
|---|---|
| Shared address **contract** + the guarded set-target service semantics | **#3** (calculator; holds both writers' address model) |
| **Grain convention** ratification (nullable chain, no-sentinel, chain-consistency) | **#8** — exactly as it ratified for `kpi_actual` |
| **DDL authoring** for `kpi_target` (mirrors `kpi_actual`, which #4 authored) | **#4** authors; **#2** integrates it into the period-dim migration package and owns apply-sequencing + drift/reconciliation |
| **Target semantics / UX** (who sets a target, at what grain, the plan/trajectory surface) | **#5** (BSC Builder) |

The DDL split (#4 authors, #2 integrates & sequences) formally resolves the earlier
"#2 owns all shared-table DDL" note: #4 drafts, #2 still runs/sequences the apply.

---

## 2. `kpi_target` — the four firm rulings

1. **Single relational table** mirroring `kpi_actual`'s address (§0). NOT a JSON
   column. Replaces `kpi_definitions.targets`.
2. **Utility-set only.** A `kpi_target` row is **the utility's own** target.
   `source ∈ {direct, bsc}` distinguishes only *how the utility entered it*
   (direct KPI target-setting vs via a BSC) — both are the utility. Plus
   `set_by`, `set_at` provenance.
3. **One target per cell.** Unique on the full address (`kpi_def_id`, `period_id`,
   7 grain cols, 10 dims), `NULLS NOT DISTINCT`. On set/update, if a target
   already exists at that **exact** address, the setter is **alerted with the
   existing value + provenance and must explicitly confirm override** — never
   silent, no automatic precedence. `direct` and `bsc` override each other this
   way (both are the utility's own).
4. **Both set-paths route through ONE guarded set-target service.** Neither the
   direct KPI-target UI nor the BSC Builder writes directly. The BSC can **no
   longer blind-write-through** to `kpi_definitions.targets` (its current
   behaviour) — a BSC save that lands on an existing direct target raises the
   same override alert, and vice versa.

### 2.1 Grain, roll-up, carry-forward

- **Utility-or-finer only** (ruling B). A target attaches to an accountable
  entity; an above-utility (cohort/country) figure is a **benchmark**, not a
  target, and does not belong in `kpi_target`. Enforce utility-or-finer.
- **Targets never roll up** (#8). Comparison is **exact-address only** — mismatched
  grains simply don't join, so no fabricated comparison. A utility target is
  **never** Σ of station targets. Any utility-over-stations view is *display*
  aggregation with its own labelled semantics, never address math. (This is the
  target-side twin of "aggregates are computed, never stored.")
  - **Cascade ≠ roll-up.** Roll-up (bottom-up Σ) is prohibited. A top-down
    *cascade* (an authority figure propagating down — §5) is a different
    direction and is allowed; it does not aggregate.
- **No auto carry-forward** (ruling C). A target is a declaration **for its
  period**; absence next period = no target, not inheritance. Multi-year targets
  are entered as explicit per-period rows (as today). A standing / effective-dated
  target would be a deliberate temporal-model decision, not an accident.

### 2.2 No availability machinery

`kpi_target` gets **no** `no_data_reason`, **no** shells, **no** completeness
denominator, **no** approval status. Targets are sparse **declarations** (like
relevance rows), not answers to expected questions — absence = "no target set,"
which is meaningful, not a gap. Visibility is own-utility planning, **not** the
benchmarking approval gate.

### 2.3 Set-time evaluation-coverage guard (#8)

The guarded set-target service must warn when a target's grain has **no matching
actual computation** — e.g. a station-grain target for a KPI that only computes at
utility grain will never match and would sit silently unevaluated. At set/update,
validate the KPI produces (or is configured to produce) actuals at that address;
warn explicitly: *"target will not be evaluated until the KPI computes at this
grain."* Same no-silent-wrong family as the override alert.

---

## 3. `kpi_actual` — divergent columns (recap)

Per [kpi-actual-ddl-design.md](kpi-actual-ddl-design.md): actuals carry
`value numeric` **XOR** `no_data_reason`, plus `status` context (via the period)
and compute provenance (`computed_at`, `formula_version`). The published/approved
gate is the canonical `publishedPeriodCondition` = `status_id = 5 (APPROVED)`
(equality); the working/pre-approval slice is `status_id <> 5`. The calculator
already computes over working (unapproved) `data_entries` — the pre-approval
cadence exists today; only its destination (`kpi` table → `kpi_actual`) is the
pending write-path work.

---

## 4. Authority (PPA / Country) targets — PLANNED EXTENSION, not built

Ruling E (Eugene, 2026-09-09): **`kpi_target` can only be set by a utility.**
Where **PPA or a Country** imposes or recommends a target, that value **must not
be confused with, or replace, `kpi_target`** — it is tracked as a **distinctly
separate field, with its source clearly identified (PPA or Country).**

**Chosen shape — (a) extra fields on the same addressed row:**

- On the `kpi_target` row (same exact address, at the utility grain the authority
  target cascades **down** to): add `authority_target_value` +
  `authority_source ∈ {PPA, Country}` (+ authority `set_by`/`set_at` as needed),
  **beside** — never overwriting — the utility's own `value`.
- A cell may then hold **both** the utility's own target *and* an authority target,
  as **distinctly different** values, so a view shows **actual vs utility-target vs
  authority-target** without conflation.
- The authority target is the utility's own target's **peer, not its competitor**:
  it never participates in the one-target-per-cell override rule (§2 rule 3), which
  governs only the utility's own `value`.
- An authority-only cell (authority recommended a target, utility set none) is a
  row with `value` NULL and the authority fields populated — accepted under (a).

**Not built.** `source` and these fields are designed forward-compatibly so this
arrives as an additive change. `gold_fact` (§6) treats the authority target as a
**distinct** arm/field from the utility target, never merged.

---

## 5. Build order & gating

`period dim (canonical) → report_periods FK → kpi_target → kpi_actual`.

- **Hard prerequisite:** the canonical period dimension (#2, joint). `kpi_target`
  cannot use `report_periods` (§0), so it is blocked until the period dim exists —
  this is a real dependency in front of the work, not just prioritisation.
- Both facts FK the **same** period dim.
- Design-only until Eugene prioritises the `kpi_actual` write path (the (a) full
  write path vs (b) interim `kpi → kpi_actual` bridge decision, per #4's thread).

---

## 6. `gold_fact_value` integration (#4)

A relational `kpi_target` slots into #4's governed fact as its own
`content_class = 'kpi_target'` UNION arm — one row per target value, same
governance columns (`owning_org`, category/subgroup via `kpi_definitions`, value).
`actual ⋈ target` becomes a same-exact-address row join. This is the **only** way
targets reach Power BI as rows (today they are trapped in JSON, unexposable), so a
relational `kpi_target` is a **prerequisite** for any target-vs-actual on the
governed fact. Authority targets (§4) surface as a **distinct** field/arm, never
folded into the utility-target arm.

---

## 7. Chain rules inherited verbatim from #8

Nullable grain chain filled level→root; generated `grain_level` (shared
derivation + type with `data_entries` / `kpi_actual`); **no sentinel values**;
chain-consistency enforced on the write contract; `NULLS NOT DISTINCT` unique
address. Nothing new is invented for `kpi_target` — the convention stays coherent
through one ratifier (#8).
