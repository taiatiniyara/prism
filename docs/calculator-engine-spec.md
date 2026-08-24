# PRISM 2 — Calculator Engine & Formula Builder Spec

**Status: DRAFT for discussion** · created 2026-07-23 · expanded 2026-07-23 with the
single-node model, the input-context/traceability model, current-state findings, and the
referential-integrity rules · 2026-07-24 engine topology, compute home, gold-refresh model, and
cross-scope aggregation (two-axis, ratio-safe) decided (§4.4–4.6).

> **Provenance.** Captures the calculator design from the *"PRISM 2 schema for AI optimization"*
> session and the follow-up deep-dive. The engine machinery described in §4 exists in an earlier
> form (see §2). Everything about the **binding/context model (§5)**, the **single-node model
> (§3)**, and the **integrity rules (§6)** is a **PROPOSAL / recommended direction**, not
> as-built — except items explicitly marked **DONE**. Open forks are collected in §11.

**Scope:** the engine that computes `calculated_input` measures and `KPI`s from stored formulas,
how each formula input's **context** is stored for traceability, what happens when a referenced
measure is deleted/deactivated, and the formula-builder UI. Sits downstream of the data-entry
schema (`schema-redesign-medallion.md`) and the migration loader (§4.3 there): the loader lands
empty calculated shells; this engine fills them.

---

## 0. Design principles

1. **One kind of computed thing.** The calculator produces **computed measures** from formulas.
   Whether a computed value is *also surfaced as a KPI* is a downstream label, not a different
   kind of calculation. (§3)
2. **Context lives on the binding, not the measure.** In PRISM 2 a measure is *pure* ("Electricity
   Generated"); which slice a formula means (Renewable? Residential? Prepaid?) is recorded on the
   **input binding**, because one formula mixes slices. (§5)
3. **Complete, explicit, and linked.** Every input records all applicable dimensions; each is a
   specific member, an explicit **All**, or an explicit **inherit** — never "absent = guess". And
   it is a real link (foreign key), so it can't silently point at something deleted. (§5, §6)
4. **Goals are not computation.** A KPI's target and limit describe what the value
   *should be*, not how it's derived. They live in the targets/limits/BSC editors, never in the
   formula builder. (§7)
5. **Compute once, reference many.** A value is computed in exactly one place; anything that also
   needs it *references* it rather than re-deriving it (which would let the two drift). (§3)
6. **Fail loud, never silent.** A KPI never computes on a missing input and never quietly drops a
   broken one — it shows a clear status describing the problem. (§6)
7. **Testable and stays tested.** Sample-value test cases are authored with a formula and re-run
   automatically when it (or anything upstream) changes. (§8)

---

## 1. The problem

A computed value must recompute automatically when anything it depends on changes — whether that
change arrives by **migration** (loader fills a raw shell) or **data entry** (a user keys a value).
If the recomputed value feeds another computed value or a KPI, those recompute too, transitively.

Two questions this spec answers:
1. Can one calculator compute both `calculated_inputs` and `KPIs`? → **Yes — there is one kind of
   computed thing; "KPI" is a label on some outputs.** (§3)
2. Where is each formula input's context (its dimensional slice) stored so it's always traceable?
   → **On a first-class, fully-dimensioned, FK-backed binding.** (§5)

---

## 2. Current-state reality (what's actually in p2 today)

Findings from inspecting the live database and code, 2026-07-23. These shape what we build.

**The KPI world and the measure world are separate and barely connected:**
- `measure_definitions` (117 rows) carries its own `formula`/`formula_inputs` and the flags
  `is_calculated` (2 rows: Total Costs, Profit), **`is_kpi` (0 rows — the flag is inert/unused)**,
  `is_kpi_input` (6 rows, stale).
- `kpi_definitions` is a **separate** table (145 rows / 144 active) with its *own* formula, plus
  targets / limits / BSC linkage / benchmarking. KPIs are computed here, written to
  the `kpi` values table by the `kpi-worker`. **`measure_definitions.is_kpi` plays no part** in
  KPI computation.
- There is **no foreign key** linking the two tables. A measure being "also a KPI" is not
  expressible today beyond an inert boolean.

**How KPIs are computed today:** a data entry changes → `kpi-worker` loads active `kpi_definitions`,
keeps those whose `formula_inputs` reference the changed measure, evaluates the KPI's own formula,
writes the `kpi` table. Nothing reads `is_kpi`.

**The KPI definitions don't align with the current measures:**
- Of 259 KPI input bindings, only ~12 resolve to a current measure by id (+22 by name); **225 are
  unresolvable** — they reference the pre-collapse / dictionary input universe (ids up to 1803;
  current measures are ids 1–503).
- Shapes: **42 pass-through projections** (`formula = one input` — e.g. "Land Area"), **85
  multi-input** computations, **16 formula-less** (descriptive/manual).

**DONE this session — the legacy key fix:** stored KPI bindings used the legacy key `input_def_id`
while the resolver read `measure_def_id`, so every binding was silently dropped. Fixed by
(a) a shared shim `app/data-entry/kpi-worker/normalizeFormulaInput.ts` that reads
`measure_def_id ?? input_def_id`, wired into `resolveInputs.ts` + `resolveTargets.ts` (+ regression
test), and (b) a backed-up migration (`scripts/fix-kpi-formula-input-key.ts`, backup
`backup.kpi_formula_inputs_backup_20260723`) that normalised 129 defs. This fixes the *key name*;
it does **not** fix the disjoint id universe.

**Build-window coordination — energy-dim physical rename (owned by #4).** #4 is authoring ONE atomic
rename on branch `claude/energy-dim-rename-full`: `energy_provider_id→provider_id`,
`energy_type_id→category_id`, `energy_source_id→technology_id`, `energy_resource_type_id→asset_id`,
`energy_resource_id→unit_id`; table `energy_resources→units`; **and the matching `energy_*` keys in
`FormulaInput` / `kpi_definitions.formula_inputs`**. **#4 moves the resolver itself** — it touches
`kpi-worker/resolveInputs` + `normalizeFormulaInput`, `settings/kpi`, and `settings/inputs`
formulaBuilder. **FREEZE (per Eugene): the calculator stream must NOT edit those shared files or
pre-stage a rename until #4's branch merges** — #4 will ping when it lands. So this rename is *not*
our task; we just adopt the physical names in the `formula_binding` design (§5.3) and consume the
renamed columns/keys after it lands. Note: **`kpi_definitions.category_id/subcategory_id` are NOT
renamed** (Eugene's call) — that's the KPI *grouping*, distinct from the energy `category` dimension
(`data_entries.category_id`); same word, different table, no conflict with our `dimension_key`.

**Landed:** this rename shipped as #68 (energy cols) and a follow-on **#78** (`asset_id→asset_class_id`,
`agg_level_id→strata_id`, `agg_level→strata`) — both merged + DDL applied 2026-07-28; the resolver and
`FormulaInput` are on the final names. §5.3 carries the authoritative physical names.

**DECISION (locked this session):** KPIs will be **rebuilt manually after the measure migration
is done**, not mechanically re-pointed. The current KPI definitions are treated as a reference
list to rebuild from, not data to migrate. This spec is the model they'll be rebuilt onto.

---

## 3. One node type: computed measures (KPI is a label)

The calculator produces **computed measures**. There is no separate "KPI calculator": once goal
fields (target/limit) are set aside as *not computation* (§7), a KPI and a calculated
input are the **same thing to the calculator** — a formula that produces a value at a scope. So
"KPI" is a **publishing tag** on some computed outputs, deciding where the value is surfaced
(dashboards / BSC) and whether goals are attached — not a different calculation.

**Consequences:**

| | plain meaning |
|---|---|
| calculated_input | a computed measure that feeds other formulas (intermediate) |
| KPI | a computed measure (or a raw one) **also surfaced for tracking**, optionally with goals |

**A measure that is "also a KPI" — declare by reference, never re-derive.** If a value is computed
once as a measure and also needs to be a KPI, the KPI **references** that measure; it does not
restate the formula. Re-deriving would let the KPI and the measure silently disagree (the exact
drift class we've hit). The three real cases:

| Situation | Model | Re-authored formula? |
|---|---|---|
| **Pure KPI** — a ratio that exists only as a KPI, feeds nothing (e.g. an efficiency ratio) | own formula, terminal | Yes — it *is* its own computation |
| **Promoted measure** — a measure that *is* the KPI, same value (e.g. "Total Renewable Generation") | KPI **references** the measure (a "track as KPI" facet), no formula of its own | **No** |
| **KPI = rollup of a measure** — same value, higher scope (input per service-area, KPI per utility) | reference to the measure **+ an aggregation level**, not a restated formula | No re-derivation |

Mechanically: add a nullable pointer from a KPI to its source measure (`source_measure_def_id`).
Set → the KPI is a projection of that measure (no own formula). Null → a pure KPI with its own
formula. The `measure_definitions.is_kpi` flag becomes a *derived hint* ("is this surfaced as a
KPI"), kept in sync but not authoritative — the link is the pointer.

---

## 4. The unified engine

One reactive engine over a single dependency graph; every computed node uses the same
parse → resolve-inputs-in-context → evaluate → write path. The `kind` decides only where the
result is written and whether it can feed others.

- **Dependency graph** — nodes = measures (raw + calculated) + KPIs; edges from each node's input
  bindings. Built once, cached, rebuilt when a formula changes. **Cycles rejected at save time.**
  A precomputed topological order replaces the old multi-pass fixpoint.
- **Change propagation is cell-level over a measure-level graph** — a value changes at one address
  (period × grain × dimensions); the engine walks downstream nodes and recomputes each at the
  matching scope, mapping input-cell-scope → output-cell-scope via the binding's dimension pins (§5).
- **Two modes, one engine:** **batch** (migration completion sweeps the graph per period and fills
  the calculated shells + KPIs) and **incremental** (one entry changes → recompute only the
  affected subgraph).
- **Reliability** — reuse the existing attempts/retry/lock/status services as the recompute queue.

Existing pieces to reuse/refactor: `aggregated-worker/orchestrator.ts` (calc inputs, multi-pass
fixpoint), `kpi-worker/worker.ts` (KPIs, already reactive), the dependency classifier and reactive
target resolver.

### 4.4 Engine topology & compute home (DECIDED 2026-07-24)

**Topology — unify by refactoring.** One shared evaluation core (parse → resolve-inputs-in-context
→ evaluate → cascade over one dependency graph). The two existing workers become thin
**write-adapters** differing only in where the result lands (`data_entries` vs the KPI fact). Keep
and reuse the existing reliability plumbing (attempts / retry / locks / scope-guard). Not greenfield,
not left split.

**Compute home — one evaluator, split roles.** There is exactly **one** thing that evaluates a
formula: the app engine.
- **Finest scope — live.** The app engine evaluates finest-scope values incrementally on data entry,
  and fills the calculated shells in the batch sweep after migration.
- **Rollups — a gold-refresh job that reuses the *same* engine.** To roll a KPI up a level, the job
  **sums the raw inputs** to that level and **applies the formula through the one engine** — never a
  SQL re-implementation. Results are materialized into gold.
- **Gold never re-evaluates formulas.** Rationale, concrete: today's `gold.fact_kpi_rollup` comment
  claims it "re-applies the KPI formula at each level," but the SQL actually does
  `AVG(actual_value)` — an **average of ratios**, the exact forbidden behavior — because a SQL view
  cannot evaluate 145 heterogeneous per-KPI formulas. One evaluator gives correct numbers,
  explainable lineage, and a consistent historical series — all of which the AI depends on.

**Prerequisite — the computed-KPI table (SHARED, do not duplicate).** The engine writes computed
KPI values to **`kpi_actual`** — the *same* table the KPI-time-series streams (#8/#5/#9) call
`kpi_actual`, **not** a separate `fact_kpi`. There is exactly one computed-KPI table, the calculator
is its **sole writer**, and the BSC/target streams read it (targets live separately in `kpi_target`).

`kpi_actual` holds *computed* values where `data_entries` holds *entered* ones, keyed on the **same
grain convention** — so an input cell's address and the output cell's address share one scheme.

**Grain convention DECIDED (Eugene ruled 2026-07-27): the hybrid nullable chain.** `data_entries`
grain is the as-built **nullable hierarchy chain** — `utility_id + country_id + subregion_id + region
+ service_area_id + power_station_id + unit_id`, filled *down to the row's level* with NULL below;
**level = the deepest non-NULL column**, surfaced as a generated **`grain_level`**
(`'unit' | 'station' | 'area' | 'utility' | 'country'`) so humans/AI filter by level without
NULL-pattern logic. **No sentinel grain values, ever.** (The earlier exactly-one-anchor "Option A" is
**superseded** — do not use it.)

**`kpi_actual` reuses this model verbatim** (incl. `grain_level`):

`kpi_actual = (kpi_def_id, period_id, ⟨nullable grain chain⟩, grain_level, 10 dimension slices, value, computed_at, formula_version)`

- **`NULLS NOT DISTINCT`** unique address (grain columns are nullable).
- **Never a sentinel** — a rolled-up row addresses the *real* parent entity; "All Countries" is a
  **computed** aggregate, never a stored address (§0.4).
- **RLS owning-org column** (#12), derivable at write time.
- **`period_id`** = the canonical `period` dim (a per-utility submission row can't key a country rollup).
- **Chain-consistent grain** — the nullable chain is filled from the row's level *up to the root*
  (finer levels NULL below it); **#2 enforces chain-consistency** (Eugene-confirmed 2026-07-27), so
  our write path must emit the **full up-chain** for each computed row, not just the level column.

**Two-axis rollup — works unchanged (§4.6):** a **grain rollup** writes the *coarser* address (finer
grain columns NULL, `grain_level` = the coarser level); a **dimension rollup** pins the **All** member
on that dimension. `kpi_actual` is the **one place coarse-grain computed values live** — `data_entries`
stays finest-per-measure-per-period.

**HOLD lifted** (grain convention ruled). **DDL ownership: #4 writes the `kpi_actual` DDL** (all
shared-table DDL is #4's per Eugene); #3 owns
the column-set-merge spec + write path. Still pending: #2's confirmation of the dimension
columns / merged set — see WORKSTREAMS.md cross-stream note.

### 4.5 Gold refresh model (DECIDED 2026-07-24)

Gold is **materialized** (not compute-on-read views), populated by the engine, and read by the AI,
dashboards, reports, and external tiers. It is **dirtied by four events** and refreshed
incrementally (recompute only the stale `node × scope × period`, never a full rebuild):

| Event | What goes stale |
|---|---|
| Value entered / edited / deleted (entry or migration) | finest-scope nodes at that slice **+ every rollup scope above them** |
| Entry **Approved** / un-approved | the *published* surface (external + cross-utility AI) |
| Definition change (formula / binding / target / activate-deactivate) | every instance of that KPI/measure across periods & scopes |
| Context / relevance change (registry, tariff structure) | the expected shell set for that utility |

**Cadence:**
- **Finest scope — immediate** (reactive; the owning utility sees its provisional figure update live).
- **Rollups + materialized gold — deferred** (debounced until a burst of edits settles).
- **Published surface — on Approval** (so the AI, reports, and external buyers read a stable number,
  never something mid-edit).

**Two surfaces, from the access rules:** *provisional gold* (reactive; owner + owner's AI, labelled
provisional) and *approved gold* (snapshot on approval; cross-utility AI, benchmarking report,
external tiers).

**Guardrails (both matter for AI trust):**
- Definition changes recompute *current* values but **version** historical ones — never silently
  rewrite a figure already published in a report (`kpi` rows carry `calculation_formula_version`).
- Every gold fact is stamped `computed_at` / `refreshed_at` so the AI can state its as-of date
  ("as of last night's refresh, on approved data through period X").

### 4.6 Cross-scope aggregation — common, deep, two-axis (DECIDED 2026-07-24)

Cross-scope aggregation is **not** an edge case — it is the normal shape of the operational
KPIs. Ratio KPIs such as **Availability Factor, Capacity Factor, Generation Forced/Planned Outage
Indicators** are each computed at **every combination of two hierarchies**:

| Axis | Levels |
|---|---|
| **Grain** (physical "where") | unit → power station → service area → utility → country |
| **Energy dimension** (the "what kind") | technology → category → asset class (→ provider) |

So one KPI resolves to many addresses — "AF for this diesel unit," "AF for all Renewable generation
in a service area," "AF for the whole utility," etc. Consequences for the engine:

1. **Rollup is central, along both axes.** Dimension rollup = the binding's tag card set to **All**
   on that dimension (technology → category → all); grain rollup = the binding's **grain rule
   `rollup`**. The one engine applies the formula at each address over the rolled-up inputs.
2. **Ratios must never be averaged.** Every level is computed by **summing the additive inputs to
   that address, then applying the formula** — never by averaging the finer-level ratios. (Unit A
   90/100 and Unit B 400/500 → fleet AF is (90+400)/(100+500)=**81.7%**, not the (90%+80%)/2=**85%**
   an average would give. Weighting by size is the whole point.)
3. **Inputs are stored at the finest grain (unit) with full dimension tags**, and must be
   **additive quantities** (available-hours, MWh, outage-hours, capacity-hours) — never pre-computed
   ratios. The ratio is only ever formed at the final step, at each level. This is a defining
   constraint on how these KPIs' *inputs* are specified.

### 4.6.1 Capacity KPIs & unit lifecycle (DECIDED 2026-07-28 — option (a))

Per `unit-lifecycle-spec.md` §4, units are temporal (SCD-2 stints), so a capacity-factor
**denominator is `Σ(stint_capacity × stint_hours)`** over a period's overlapping stints (a
single capacity-per-period can't express a mid-period derate). This is fully consistent with §4.6
(ratio-of-sums, additive inputs) — **Capacity Factor = `Σ(generation) ÷ Σ(capacity-hours)`** at
every level, and capacity-hours rolls up unit→utility by summing.

**Ownership (Eugene's call, option (a)):** the stint→capacity-hours weighting is a **silver-derived
measure** (computed in the data layer, #8, per (unit, period)) — *not* a hand-entered fact and *not*
computed inside the calculator. The engine consumes **capacity-hours as an ordinary additive input**
and just divides + rolls up; it stays **free of stint awareness**. Consequences:
- The retired **"Rated Capacity"** measure is not a binding target — the **manual KPI rebuild binds
  capacity KPIs to the silver `capacity-hours` measure** instead.
- Additive/time-based facts (MWh, hours) arrive **already prorated** by `days(stint∩period)/days(period)`
  (upstream) — the calculator receives them as normal additive inputs.
- The **energy-balance check** (`generation ≤ Σ(cap×hours) − downtime_energy`) is data-quality
  validation owned by the loader/gold layer, **not** the formula evaluator.

### 4.6.2 Input sources — not every input lives in `data_entries`

A binding references a measure by `measure_def_id`; the **resolver dispatches to that measure's
home** when reading its value. Most measures resolve from `data_entries`, but some do not, and the
resolver must route accordingly (the binding/formula stay identical — this is purely *where the value
is read from*):

| Input kind | Read from | Notes |
|---|---|---|
| Raw / calculated measures | `data_entries` (the address model) | the default |
| **Country-context** measures (the 16 flagged `measure_definitions.is_context_fed`, subgroup **221** — e.g. Population, GDP Per Capita) | **`country_context`** table (keyed by `measure_def_id × period_year`), via the **`getResolvedContextRows`** bridge | #4, Option 2 (`fcf8e4e`; FY-end-aware since `6504e7e`; flag added `8d80cc6`); **read-time carry-forward per report period**; used as per-capita / per-GDP **denominators**. NOT in `data_entries`. |
| Capacity-hours | silver-derived measure (§4.6.1) | `Σ(stint_cap × stint_hours)` |

So a "per-capita" KPI (e.g. `x ÷ population`) binds `population` like any input, but the resolver
fetches it from `country_context` (carry-forward), not `data_entries`. **Build notes:**
- The resolver needs a small **source-dispatch** layer keyed on the measure's home — dispatch
  country-context reads (measures flagged **`is_context_fed`**) through `getResolvedContextRows`;
  build against `6504e7e`+ so carry-forward matches the FY-end-corrected period labels (the bridge's
  signature is unchanged).
- **Staleness is not silent (#8 hole H2).** Carry-forward is unbounded, so a benchmarking KPI could
  divide by a years-old denominator. `getResolvedContextRows` returns **`period_year` on every row**,
  so the resolver **surfaces the denominator's age and flags staleness** rather than emitting a
  silent stale figure; an **approved snapshot pins the RESOLVED context** it was computed against
  (no re-drift). This is a read/provenance concern (like `no_data_reason`), not a change to the
  formula or binding.
- **A not-available context row propagates (§9.1).** `country_context` now carries the same
  availability axis as `data_entries` (`no_data_reason`, `024d935`): a not-available context measure
  resolves to `value = null, no_data_reason = 'not_available'` on the `ResolvedContextRow`. So a
  **not-available per-capita / per-GDP _denominator_ makes the whole KPI not-available (null + reason),
  never 0** — exactly §9.1's rule, now applying to the country-context source too (zero-fill never
  applies to a denominator regardless of source). Interface addition only; existing fields unchanged.

### 4.6.3 Tariff bills & currency conversion (DECIDED 2026-08-24)

**The problem.** Utilities submit a *tariff structure* in **local currency** — a fixed/rental charge,
an energy rate per consumption block, the block limits themselves, and a GST rate — varying by
**customer type**, **payment mode** (prepaid/postpaid) and a **tariff class** (Standard vs Lifeline).
Benchmarking needs the **cost of a fixed reference consumption** (e.g. "Residential postpaid @ 200 kWh"),
computed from that block structure and **converted to USD** so utilities compare like-for-like.
~72 such tariff KPIs (source: `kpi_tariff_structure - 20260824.xlsx`), enumerated by
`customer_type × payment_mode × reference_kwh × tax_treatment (GST incl/excl)`.

A block-tariff bill is **not arithmetic over a single expression** — it is a piecewise calculation
over the block table. Modelling it as a user-authored formula would (a) make it un-reviewable as a
stable comparable, and (b) let each utility express it differently, defeating comparability.

**Decision — a system-defined built-in evaluator (Decision #1 = A: calculator-side & reactive).**
The engine gains a **formula _kind_**: a computed measure's formula is either
- `arithmetic` — a user expression over tag-card inputs (everything today), **or**
- a **named built-in** — a system-defined evaluator identified by name (`block_tariff` is the first).

The block-tariff bill is a **first-class computed measure/KPI** whose formula `kind = block_tariff`.
It is **reviewable exactly like any KPI** — the BLO review surfaces the bill **and** its inputs
**and** its formula — because *BLOs review the bills and care that the figures are correct for the
benchmarking comparisons* (Eugene). Being built-in and **system-defined makes the formula identical
across utilities** (the comparability guarantee); utilities supply only the *inputs*, never the
calculation.

**One evaluator, reactive + materialized** (consistent with §4.4). The same `block_tariff` code path runs:
- **reactively at review time** — so the BLO sees the computed bill (and its USD value) while validating, and
- **at gold refresh** — materialized into `kpi_actual` for benchmarking.

It is never re-expressed in SQL and never authored per-utility.

**Inputs (ordinary tag-card bindings).** The utility-entered **tariff components** are normal measures
in `data_entries`, bound like any input (§5), sliced by `customer_type × payment_mode × consumption_band`
(+ `tariff_class`, below):

| Component | Role in the evaluator |
|---|---|
| Fixed / rental charge | flat addend |
| Energy rate per block | price applied to the kWh falling in each `consumption_band` |
| Block limits | the band boundaries — which `consumption_band` a kWh falls into |
| GST rate | applied iff the KPI's `tax_treatment = includes` |

**Parameters (fixed on the KPI definition, not entered).** Each tariff KPI carries evaluator
parameters — seeded from the xlsx:
- `reference_kwh` — the consumption point the bill is computed at, **customer-type-specific**:
  Residential Lifeline 60/120/180 · Residential 100/200/500 · Commercial 1000/5000 · Industrial 10000 ·
  Government 1000/5000 · Streetlights 1000 · Recreational/Others 100/500/1000.
- `tax_treatment ∈ {includes, excludes}` — GST-inclusive vs -exclusive variant.
- `tariff_class ∈ {Standard, Lifeline}` — see below.

These live as **built-in-evaluator parameters** on the formula/computed-measure definition (a small
`params` payload), **not** as entered data and **not** as dimensions.

**Tariff class — a lightweight qualifier, not a dimension (confirmed).** `Lifeline` is a **sub-tariff
within a customer type**, not a customer type of its own and **not an 11th dimension**. Residential
Lifeline = `customer_type = Residential` **+** `tariff_class = Lifeline`. It qualifies both the tariff
KPI and its component inputs; the ~10-dimension model (§12) is untouched.

**How the class is carried — separate measures per class (DECIDED 2026-08-25, Eugene via #2).** Because
`tariff_class` is deliberately **not** a dimension, it can't be a slice on the row; instead it is carried
by **measure identity** — each tariff component has a **Standard measure and a parallel Lifeline
measure**. This keeps the dimension set clean, needs no new `data_entries` column, and gives distinct
addresses (the precedent is #2's gender 250/251 split). Concretely:
- **Existing tariff component measures = the Standard set.** p1 has **zero Lifeline entries** (all p1
  tariff is Standard-class, Eugene-confirmed), so #2's migration maps **every p1 tariff input onto the
  existing (Standard) measures unchanged** — no class field, no collision, and `tariff_class` drops out
  of the migration entirely.
- **Lifeline is forward-looking.** Parallel **Lifeline-twin** component measures are added to the
  catalogue (mirroring the Standard defs, `is_context_fed = false`), **empty at migration** (no data yet).
  `block_tariff` binds the Lifeline component set on them when Lifeline data later exists. Naming: the
  existing measures **stay as-is** (Standard is the implied default — no rename churn); Lifeline twins are
  added alongside.
- **Ownership of the twin build (forward, non-blocking):** Eugene/BMO decide *which* components a
  Lifeline tariff carries → **#3** pins the twin list + their `block_tariff` bindings in this section →
  **#2 or #4** creates the mirrored `measure_defs`. Gated only on the tariff extract revealing the actual
  component measures; it does **not** block #2's migration.

**Currency → USD via measure 140 (Decision #3).** FX is the existing measure **140 "USD Exchange Rate"**
(`usd_exchange_rate_ratio`) — a **dimensionless ratio reported per (utility, period)** (one rate for
every slice; verified: no dimensional scope). It binds as an **ordinary input** (all dims inherit;
grain = utility/period), so:

> `bill_USD = block_tariff(local components, reference_kwh, tax_treatment) ⊗ rate(140)`

The FX rate appears **as an input in the review**, keeping the USD figure transparent. This is
**general** — any monetary KPI converts to USD by binding 140, so it is not tariff-specific.
*(Build note: confirm 140's direction — local-per-USD vs USD-per-local — to fix `⊗` as ÷ or ×.)*

**Why this fits the existing engine.**
- The bill stays a **computed measure** (§3) — KPI is still just the publishing label; no new node type.
- Inputs and FX are **ordinary additive/ratio inputs** via the tag-card model (§5), resolving from
  `data_entries` (§4.6.2 default) — no new input source.
- Cross-scope rollups (§4.6) don't apply to a per-slice reference bill (it's a point calculation at a
  fixed kWh); the evaluator returns the slice value and the FX multiply is per (utility, period).
- The only genuinely new surface is the **formula `kind`** (arithmetic | named built-in) + a **`params`
  payload** for built-ins. Everything else reuses §3–§6.

---

## 5. Input context & traceability — "a tag card for every input"

### 5.1 Why this exists (plain language)

Old PRISM wrote every input out in full — *"Utility Coal Generation Planned Downtime"* — so a
formula could just point at it; the item *was* its own description. PRISM 2 shortens the input to a
generic measure — *"Electricity Generated"* — and asks you to attach **tags**: `category =
Renewable`, `technology = Solar`, `customer_type = Residential`, `payment_mode = Prepaid`. That's
cleaner, but only if there is somewhere to put **all** the tags. The context that used to live in
the dl_def's name now has to live on the **input binding**.

It must be **per input**, because one formula routinely mixes slices — e.g. *renewable generation ÷
total generation* uses the same measure twice at two different tags.

### 5.2 What's insufficient today

The current binding (`FormulaInput` JSON) pins only **3** of the 10 canonical dimensions —
`energy_provider / energy_type / energy_source`. So:
- **7 dimensions have nowhere to go** (`asset, category(*), technology(*), customer_type,
  payment_mode, band, division, gender, utility_function`) — a KPI like "residential prepaid
  revenue" **can't be written down**, and the resolver would silently sum across every customer
  type.
- **Unpinned is ambiguous** — the resolver treats an unpinned dimension as "match where the column
  is NULL", but the new model made every dimension NOT NULL with an explicit **All** member, so
  unpinned bindings won't match the new data correctly.
- It's a JSON blob with **no foreign keys** — a binding can name a deleted measure/member silently
  (this already happened twice: the key name *and* the id values drifted).

### 5.3 The model — normalized, complete, explicit, linked

Move bindings out of the JSON blob into two tables shared by calculated inputs and KPIs (one
binding model for the one engine). Each formula variable gets a **binding** (its "tag card"); each
tag it sets is a **binding-dimension** row.

```sql
-- One row per (owning definition, variable in its formula).
CREATE TABLE formula_binding (
  id                   serial PRIMARY KEY,
  -- OWNER: the definition whose formula this variable belongs to.
  -- Exactly one owner FK set. (Collapses to one FK if calc-inputs and KPIs
  -- ever share a single definition table.)
  owner_measure_def_id integer REFERENCES measure_definitions(id) ON DELETE CASCADE,
  owner_kpi_def_id     integer REFERENCES kpi_definitions(id)     ON DELETE CASCADE,
  CHECK ( (owner_measure_def_id IS NOT NULL)::int
        + (owner_kpi_def_id     IS NOT NULL)::int = 1 ),
  variable_name        varchar(255) NOT NULL,   -- the token used in the formula text
  -- TARGET: the measure this variable READS (FK — can't silently name a deleted measure)
  measure_def_id       integer NOT NULL REFERENCES measure_definitions(id) ON DELETE RESTRICT,
  -- GRAIN: where the input reads relative to the result's computation scope
  grain_mode           varchar(16) NOT NULL DEFAULT 'inherit'
                         CHECK (grain_mode IN ('inherit','rollup','pin'))
);
CREATE UNIQUE INDEX ux_binding_owner_measure ON formula_binding
  (owner_measure_def_id, variable_name) WHERE owner_measure_def_id IS NOT NULL;
CREATE UNIQUE INDEX ux_binding_owner_kpi ON formula_binding
  (owner_kpi_def_id, variable_name) WHERE owner_kpi_def_id IS NOT NULL;

-- One row per dimension the variable pins.
CREATE TABLE formula_binding_dimension (
  binding_id     integer NOT NULL REFERENCES formula_binding(id) ON DELETE CASCADE,
  dimension_key  varchar(32) NOT NULL,   -- physical dimension name (see below)
  member_id      integer REFERENCES managed_list_items(id) ON DELETE RESTRICT,
  PRIMARY KEY (binding_id, dimension_key)
);
```

**`dimension_key` uses the physical dimension names** #2 introduced —
`provider · category · technology · asset_class · unit · customer_type · payment_mode · band ·
division · gender · utility_function` — **not** the legacy `type / source / resource_type`. The
physical columns are `provider_id / category_id / technology_id / asset_class_id / unit_id / …`
(#68 physicalised the energy columns from `energy_*`; #78 then renamed `asset_id→asset_class_id`
and `agg_level_id→strata_id` to match the live *Asset Class* / *Strata* managed lists), and the
matching keys in the legacy `kpi_definitions.formula_inputs` were rewritten in step. Naming
`dimension_key` to match keeps bindings aligned with the physical schema and the settled taxonomy.

**Three states per tag — no ambiguity:**

| Intent | Stored as | Example |
|---|---|---|
| **Pin** a specific slice | `member_id` = the leaf member | `category → Renewable` |
| **All** (aggregate across this dimension) | `member_id` = the dimension's **All** member | `technology → All` |
| **Inherit** the result's scope | `member_id` NULL — one documented, enforced meaning | `service_area → NULL` |

"All" is a real pinned member, never an absence. Absence of a row = the dimension isn't applicable
to that measure (checkable against `measure_dimension_scope` at save).

### 5.4 Two worked examples (real ids)

**Energy-sliced — "Renewable Generation Share" = `renewable_gen ÷ total_gen`.** Both variables read
the *same* measure (321 Electricity Generated), at different tags:

```
renewable_gen → measure 321, category=Renewable(32), technology=All(40)
total_gen     → measure 321, category=All(30),        technology=All(40)
```

**Customer-sliced — "Residential Prepaid Avg Consumption" = `res_pp_sold ÷ res_pp_custs`.** Uses
tags the current 3-dimension blob cannot express at all:

```
res_pp_sold   → measure 302 (Electricity Sold), customer_type=Residential(691), payment_mode=Prepaid(721)
res_pp_custs  → measure 301 (Customers Served),  customer_type=Residential(691), payment_mode=Prepaid(721)
```

(No category/technology rows here — not applicable to a retail measure, so their absence is correct
and validated, not a guess.)

### 5.5 Traceability payoff

A read-back view joins each binding to its measure and members, so every KPI input is
human-readable and integrity-checked, and you can answer *"which KPIs depend on `customer_type =
Residential`?"* in one query. Two supporting pieces:

- **List-integrity guard** — enforce that a pinned `member_id` belongs to the list matching
  `dimension_key` (save-time check and/or trigger), so you can't pin `category = Residential`.
- **Computation-time provenance** — the definition says what each input *should* read; to trace a
  computed *value*, snapshot what it *did* read:

```sql
CREATE TABLE kpi_value_input (
  kpi_id           uuid REFERENCES kpi(id) ON DELETE CASCADE,
  variable_name    varchar(255) NOT NULL,
  binding_id       integer REFERENCES formula_binding(id),
  resolved_value   numeric,
  resolved_address jsonb,          -- the exact data_entries cell(s) summed
  PRIMARY KEY (kpi_id, variable_name)
);
```

So "SAIDI = 2.3" retains the input values *and* the addresses they came from.

### 5.6 The same tag card, reused for limit bands (owned by #5/#9)

KPI **limit bands** (a BMO-set acceptable lower/upper for a KPI value) are *evaluation* metadata,
not computation — they stay out of the engine and are checked at the gold/read layer against
`kpi_actual` (the "within band / breached" flag, alongside `meets_target`). But they hit the *same*
"a value means nothing without its slice" problem: an acceptable Capacity Factor band differs wildly
by technology (solar ~15–25%, hydro ~40–60%). So a limit carries a **dimensional slice through the
same tag-card mechanism** as an input binding:

```sql
kpi_limit                        -- the band
  id
  kpi_def_id   → kpi_definitions
  period_id    → period          -- limits vary over time
  lower, upper   numeric null
  notes          text            -- the BMO's justification for the band / the change
  set_by         → user          -- the BMO who set it
  set_at         timestamptz
kpi_limit_dimension              -- which slice the band applies to (reuses §5.3)
  kpi_limit_id   → kpi_limit
  dimension_key  varchar         -- e.g. 'technology' | 'category'
  member_id      → managed_list_items
  PRIMARY KEY (kpi_limit_id, dimension_key)
```

- **KPI-specific, not per-utility** — no `utility_id` (unlike `kpi_target`); every utility reads the
  same band.
- **No dimension rows = the KPI-wide default band;** pinned rows scope it (`technology = Solar`,
  `category = Renewable`, …).
- **Resolution = most-specific match**, walking the `technology → category → asset` hierarchy: for a
  Solar value, use Solar's band, else Renewable's, else the KPI default. Tiebreak: the deeper member
  wins; disallow two bands at the same level for one KPI × period.
- **History preserved** — a changed band is a *new* row with its own `notes` / `set_by` / `set_at`
  (the "version, don't silently rewrite" rule, §4.5), so the BMO's rationale trail survives.

Ownership: the **targets/BSC stream (#5/#9)** owns `kpi_limit`; it just reuses this section's
tag-card model. Replaces the `kpi_definitions.limits` JSON.

### 5.7 Naming — the token lives on the binding, not the measure (§11.11 resolved 2026-07-24)

The formula token (`renewable_gen`, `total_gen`) is a property of the **binding**
(`formula_binding.variable_name`) — one per use, unique within a formula. The model forces this:
the same measure appears more than once in one formula at different slices (§5.4), so a single
global token per measure can't tell them apart. The builder **auto-suggests** each token from the
input measure + its key pinned tag (Electricity Generated + Renewable → `renewable_gen`), editable,
and unique-within-formula. (Names enter the calculator *per input*, at the binding.)

Consequently the measure-level **`measure_definitions.variable_name` is no longer the formula
mechanism** — but it is **kept and re-purposed** as the measure's stable, human-readable machine
handle: the slug the **AI data-service** (`lib/ai/data-service/explain.ts`, `utils.ts`), other
services, `lib/formatters.ts`, and the exported artifacts reference instead of a numeric id or a
mutable display name. For an AI-optimised system a stable per-measure handle is worth keeping.
Deleting the column is a **separate cross-cutting decision** (it touches the AI layer), not the
calculator's to make — the calculator simply stops depending on it for tokens.

*(If formulas ever move from human-readable text to a structured form where each operand points
directly at a binding id, even the binding token becomes an optional display label. Not planned;
readable text formulas are retained.)*

---

## 6. Referential integrity & failure behavior

Because a binding is a real link (§5), the system knows a measure is in use and can act instead of
staying silent. The rules:

1. **Deleting a measure is blocked while any binding uses it** (`ON DELETE RESTRICT`). The delete
   attempt tells the user which KPIs/calcs depend on it, e.g. *"Can't delete 'Electricity
   Generated' — 4 KPIs use it: Renewable Share, …"*. A measure can never quietly vanish from under
   a formula.
2. **Deactivating a measure keeps its inputs visible, flagged.** The binding still exists and still
   points at the (inactive) measure, so the formula still shows the variable with a warning:
   *"`renewable_gen` reads 'Electricity Generated', which is deactivated — this KPI won't calculate
   until it's reactivated or the input is replaced."*
3. **A KPI never computes on a silently-missing input.** Instead of dropping a broken input (or
   zero-filling and returning a misleading number), the engine records a clear, typed reason and the
   KPI shows that status.

Where the alert surfaces — three moments:

| Moment | Behavior |
|---|---|
| Deleting / deactivating the measure | "these KPIs/calcs depend on it" — delete blocked; deactivate flagged |
| Opening the KPI in the builder | the affected input still shown, with a ⚠ badge explaining why |
| Calculating the KPI | a clear status, never a blank or a misleading number |

Contrast with today, where all three are silent (we already have 225 bindings pointing at
non-existent measures, dropping quietly).

---

## 7. The formula builder UI

One builder for computed measures, driven by a slim "publish as KPI" choice rather than two separate
tools.

- **Shared formula editor** — same variable picker for a calculated input or a KPI.
- **Context tags per input variable** (§5) — pin any of the 10 dimensions; each tag is a specific
  member, All, or inherit. This is the heart of the builder.
- **"Track as KPI" facet** — flipping it surfaces where the value is published (and lets goals be
  attached elsewhere); it does **not** add a second formula. For a promoted measure it just sets the
  reference (§3).
- **Targets & limits are absent** from the builder — they're goals, authored in
  `targetsEditor` / `limitsEditor` / BSC. (Trajectory was removed project-wide, 2026-07-26.)
- **No "result level" field (DECIDED 2026-07-24, §11.9).** A computed measure/KPI has no single
  result level — it computes at *every* applicable address (§4.6). The set of levels/slices comes
  from **applicability**, not a builder field. Optional: a derived, read-only **"reported at"**
  summary ("unit → country · by technology/category/asset") for author clarity — informational,
  plural, never an input. (A raw measure's native/finest grain stays — it's an input-side property.)
- **Live dependency preview** — "depends on… / feeds…", so the user sees the node's place in the
  cascade.
- **Referential warnings inline** (§6) — an input whose measure is deactivated/missing shows a ⚠
  badge with the reason.
- **Cycle + unit validation** and a **sample-evaluation readout**.

### 7.1 Access & custom-KPI governance (DECIDED 2026-08-18)

The same builder is served to **DEV**, **BMO** (system admin / PPA), and **BLO** (utility) — but the
capability is **role-tiered**, because p2 lets utilities create **custom KPIs**.

**The controlling principle — creating a *measure* ≠ creating a *KPI*.** A new **input measure** is a
new thing every utility must *collect and enter* — a platform-wide data-collection obligation, so it
is **centrally governed (DEV/BMO only)**. A **custom KPI** is just a new *formula over measures that
already exist* — no new collection burden — so a BLO may **self-serve** it. This split is the whole
control: a BLO cannot pollute the input catalogue.

| Capability | DEV | BMO | BLO |
|---|---|---|---|
| Create/edit raw & calculated **input measures** | ✅ | ✅ | ❌ — picker is **catalogue-only** + "Request a measure" |
| Create **shared/benchmarking KPIs** (standard catalogue) | ✅ | ✅ | ❌ |
| Create **custom KPIs** (formula over existing measures) | ✅ | ✅ | ✅ **for own utility only** |
| Approve BLO measure-requests & shared-KPI submissions | ✅ | ✅ | ❌ |

**BLO mode** ("Create Custom KPI"): Track-as-KPI is implicit; the new-measure path is hidden; the
measure picker offers **only existing catalogue measures** (a gap → **Request a measure**, routed to
BMO); the KPI is owned by their utility (`owner_utility_id`) and computed for it. A **dedup check** on
save surfaces similar existing KPIs to discourage clutter.

**Visibility (a required radio on the BLO form) — DECIDED:**
| Choice | Behaviour |
|---|---|
| **Private — my utility only** | **Instant, no review.** `is_private = true`, `owner_utility_id` set. Never enters cross-utility benchmarking. |
| **Share with all utilities** | **Requires BMO approval** (via `custom_kpi_request` / `custom_kpi_decision`). Stays private/pending until approved; on approval it's promoted to the shared set (`is_private = false`) and joins the benchmarking pool. Protects the pool from duplicates / low-quality / non-comparable KPIs. |

The read/benchmarking + AI layer **filters by visibility**: a private KPI is invisible to other
utilities and to cross-utility comparisons; a shared+approved one participates.

**Schema support already exists:** `kpi_definitions.type ('benchmarking'|'custom')`, `owner_utility_id`,
`is_private`, `utility_ids`; and the `custom_kpi_request` / `custom_kpi_decision` /
`custom_kpi_lifecycle_event` workflow tables carry the share-approval flow.

---

## 8. Test harness — formula regression tests

Per-variable sample inputs → live evaluate → expected value → tick if it matches. **Persist** these
as named test cases on the definition and **auto-re-run** them whenever the formula — or any
upstream formula — changes. A broken expectation flags **on save, before live data is touched**, and
plugs into the reactive cascade.

---

## 9. Missing-input policy

Keep the existing rule: **pure-addition formulas zero-fill missing inputs; every other formula waits
for all inputs.** A sum of costs is still meaningful with some components absent (they're zero); a
ratio or difference with a missing operand is "not yet computable," not a number. Centralised in the
one engine.

### 9.1 Three input states — "not available" is not zero (DECIDED 2026-07-28, #3's call)

An input can be in one of **three** distinct states; the engine treats each differently
(this refines the §6 note; driven by `data_entries.no_data_reason` from `data-availability-response-design.md`):

| State | What it means | Engine behaviour |
|---|---|---|
| **Not yet entered** (blank, no reason) | awaiting entry | "waiting / not yet computable"; the pure-addition zero-fill above applies (absent additive component = 0) |
| **Explicitly not available** (`no_data_reason` set) | the utility affirmatively declares no value exists | **propagates**: the KPI result is **not-available** (null + reason), **never 0** and never a partial number — and the zero-fill rule does **not** apply to it |
| **Measure deleted/deactivated** (referential) | binding target is gone | error/status warning (§6), never silently dropped |

**The governing rule: `not-available ≠ 0`.** An explicitly not-available input is *not* zero-filled,
even in an additive formula — because "there is no data" is a different statement from "the value is
zero." When any **required** input is not-available, the computed KPI is itself **not-available**
(the state propagates up the dependency graph and through rollups).

**Schema implication (#4 owns the `kpi_actual` DDL — draft `kpi-actual-ddl-design.md`, #3 signed off
the column set 2026-08-12):** `kpi_actual` carries a **single nullable `value numeric`** +
**`no_data_reason`** (same CHECK'd vocab as `data_entries`) + a **value-XOR-no_data mutual-exclusion
constraint** — so a propagated not-available KPI stores **`null value + reason`**, never 0/gap. Value
is **numeric-only**: computed KPIs are numbers (the evaluator does arithmetic); qualitative/text
"descriptive" values are *entered* measures surfaced via the **Track-as-KPI projection** (read from
`data_entries` by reference), **not** materialized as text in `kpi_actual`. `no_data_reason` on
`kpi_actual` is **derived-only** (always propagated from input states; never a direct KPI assertion).
The 10 dim slices match the input side exactly; `meets_target`/within-band stay gold-layer, not stored.

**The two reasons — FINALIZED (glossary `984e88a`, 2026-07-28; shared by `data_entries.no_data_reason`
AND `kpi_actual`):** `no_data_reason ∈ { 'not_available', 'asserted_not_applicable' }`.
- **`not_available`** — exists but unknown / not collected → **propagate** (KPI is not-available), never 0.
- **`asserted_not_applicable`** — utility-asserted "doesn't apply to us" on an in-scope input → an
  **additive** formula treats it as **absent (= 0 contribution)**; every other formula still **propagates**.

The rule is **locked — build against it** (impl only awaits the DDL landing). **Key the engine off
`asserted_not_applicable`, NOT bare `not_applicable`** — the `asserted_` prefix keeps it distinct in
queries/logs from `measure_dimension_scope.expansion_mode = 'not_applicable'` (dimension config),
which the resolver also touches.

*Upstream constraint (Eugene via #8, 2026-07-28):* `asserted_not_applicable` is legal only on
**optional measures (`is_mandatory = false`)** — mandatory + no-data ⇒ `not_available`. The
writer/UI enforce this, so the engine receives **already-validated** not-available values; no
engine-side gating needed.

**Two orthogonal axes, never conflated:** **`is_relevant` = SCOPE** ("is this shell expected at
all?" → excluded if false; our §5 "absence of a binding row = not applicable to this measure");
**`no_data_reason` = the KIND of no-data answer** for an *in-scope* shell. Different questions,
different axes — only `no_data_reason` is a per-input calculator signal.

---

## 10. Schema changes summary

| Change | Why |
|---|---|
| **New `formula_binding` + `formula_binding_dimension`** (§5) | Complete, explicit, FK-backed input context; replaces the 3-dimension JSON blob |
| **`kpi_value_input`** (§5.5) | Computation-time provenance of each KPI value |
| **Write to the shared `kpi_actual`** (= `data_entries` address model + `period_id` + `computed_at`) — NOT a separate `fact_kpi` (§4.4) | One computed-KPI table, calculator is sole writer; stores finest + rolled-up without overwrite; stamps freshness for AI |
| **`kpi_definitions.source_measure_def_id`** (nullable, §3) | Reference model for a KPI that projects a measure (no duplicate formula) |
| `measure_definitions.is_kpi` → derived hint (§2, §3) | Keep as a fast flag, but the reference is authoritative |
| **`kpi_limit` + `kpi_limit_dimension`** (§5.6) — *owned by #5/#9* | KPI-specific, time-varying, dimension-scoped limit bands with BMO notes/history; replaces the `kpi_definitions.limits` JSON; reuses the tag-card model |
| `ON DELETE RESTRICT` on binding→measure (§6) | Deleting a used measure is blocked, not silent |
| **DONE:** legacy `input_def_id → measure_def_id` shim + migration (§2) | Bindings resolve on the canonical key |
| **Formula `kind`** (arithmetic \| named built-in) + built-in `params` payload (§4.6.3) | System-defined evaluators (first: `block_tariff`) for piecewise calcs that must be identical across utilities; `params` (`reference_kwh`, `tax_treatment`, `tariff_class`) seeded from `kpi_tariff_structure` |

Definition tables (`measure_definitions`, `kpi_definitions`) otherwise stay separate. The JSON
`formula_inputs` columns are superseded by `formula_binding` once migrated.

---

## 11. Open decisions register

| # | Decision | Options | Leaning / status |
|---|---|---|---|
| 11.1 | Engine topology | unify by refactoring · two separate workers · greenfield | **DECIDED 2026-07-24: unify by refactoring** (§4.4) |
| 11.2 | KPI compute home | one engine (split roles) · one engine (all levels) · gold re-applies in SQL | **DECIDED 2026-07-24: one engine, split roles** — app finest live, gold-refresh job reuses the engine for rollups, gold never evaluates (§4.4–4.5) |
| 11.3 | Bindings storage | normalized tables (§5) · keep JSON blob | **Normalize** (recommended, this session) |
| 11.4 | Unpinned dimension meaning | inherit-result-scope (NULL) with All as explicit member | **Adopted** in §5 |
| 11.5 | Measure-that-is-also-KPI | reference (`source_measure_def_id`) · re-authored formula | **Reference** (§3) |
| 11.6 | Delete/deactivate behavior | block delete + warn on deactivate + never silent-compute | **Adopted** (§6) |
| 11.7 | KPI rebuild approach | manual rebuild after measure migration · mechanical re-point | **Manual rebuild** (locked §2) |
| 11.8 | Persist + auto-re-run test cases | yes · author-time-only | Yes (§8) |
| 11.9 | "Result level" field | derive + display · editable · drop | **DECIDED 2026-07-24: drop** — no single result level; levels come from applicability (§4.6, §7) |
| 11.10 | Missing-input policy | keep zero-fill-if-additive · revise | Keep (§9) |
| 11.11 | `variable_name` | token on binding · token on measure · structured (no token) | **DECIDED 2026-07-24: token on the binding** (§5.7); measure `variable_name` kept, re-purposed as a stable AI/machine handle |
| 11.12 | Cross-scope aggregation depth | same-scope only · aggregate across dims/grain | **DECIDED 2026-07-24: common & deep, two-axis** (§4.6) |
| 11.13 | Tariff-bill computation & currency | user-authored formula · **system-defined built-in evaluator** · convert at read layer | **DECIDED 2026-08-24: built-in `block_tariff` evaluator, reviewable (reactive + materialized); USD via measure 140; `tariff_class` Standard/Lifeline qualifier; `reference_kwh` + `tax_treatment` as KPI params** (§4.6.3). **`tariff_class` representation finalized 2026-08-25: separate measures per class — existing = Standard, Lifeline twins added parallel/empty (no rename); p1 all-Standard so it drops out of migration.** |

The two biggest forks (11.1 engine topology, 11.2 compute home) are now **decided** (§4.4–4.5).
Everything in §5/§6 (the binding + integrity model) is the direction the design converged on.
**All open forks are now resolved** — 11.9 (drop "result level"), 11.11 (token on the binding), and
11.12 (cross-scope) all decided 2026-07-24; **11.13 (tariff bills & currency) decided 2026-08-24**
(§4.6.3). The design register carries no remaining open decisions.

---

## 12. Locked context this depends on

- **Energy taxonomy** — `asset → category → technology`, `unit` as the registry instance; one `All`
  per level; "all of category X" = `category = X, technology = All`. See
  `schema-redesign-medallion.md` §1.2a.
- **10 canonical dimensions** — `provider · asset_class · category · technology · customer_type ·
  payment_mode · band · division · gender · utility_function`.
- **Calculated shells** — the loader creates empty shells for calculated measures (counted in the
  relevance balance) and never migrates their values; this engine fills them. Medallion doc §4.2/§4.3.
- **KPI rebuild** — KPIs are rebuilt manually onto this model after the measure migration (§2).
