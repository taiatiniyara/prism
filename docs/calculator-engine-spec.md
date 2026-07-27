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

To avoid inventing a parallel keying, **`kpi_actual` reuses the `data_entries` address model** — it
holds *computed* values where `data_entries` holds *entered* ones:

`kpi_actual = (kpi_def_id, period_id, grain anchor, 10 dimension slices, value, computed_at, formula_version)`

- **grain anchor** — from stream #8's level-anchored model (**#8 CONFIRMED `kpi_actual` reuses this
  exact anchor set, 2026-07-26**, see `multi-level-hierarchy-requirements.md`);
- **dimension slices** — the 10 dimension member columns from stream #2's medallion `data_entries`;
- **`period_id`** — the canonical `period` time axis from the KPI-time-series spec.

This gives the level+scope keying the rollup needs (the current `kpi` table stores one value per
(period, kpi_def) with no level/scope column, so rolled-up and finest values would overwrite).

**Anchor rules the write path must honour (confirmed with #8):**
1. **Exactly-one-anchor** — `CHECK(num_nonnulls(equipment_id, power_station_id, service_area_id,
   organisation_id, country_id) = 1)`; the populated anchor *is* the row's level.
2. **`entry_level`** — a derived (1–5) column so queries/AI filter by level without a CASE.
3. **`NULLS NOT DISTINCT`** on the unique address — 4 of 5 anchors are NULL per row, so a plain unique
   index would dedupe nothing (#8 flags this applies to `kpi_actual` too; PG 15+).
4. **No sentinel anchoring** — a rolled-up row anchors to the *real* parent entity (e.g. the real
   `country_id`); "All Countries"/"Others" sentinels are **computed** aggregates, never a stored
   address. (This is §0.4 — never store an aggregate as a member — applied to output rows.)
5. **RLS owning-org column** (from #12) on `kpi_actual`, derivable at write time, so tenant isolation
   can move to Postgres RLS without a second migration.

**DDL ownership (Eugene 2026-07-26): #2 writes and runs the `kpi_actual` DDL.** #3 owns the
**column-set merge spec + the write path**; we hand requirements to #2, not DDL. The dimension
columns / merged set still await **#2's** confirmation — see WORKSTREAMS.md cross-stream note.

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
| **Energy dimension** (the "what kind") | technology → category → asset (→ provider) |

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
   **additive quantities** (available-hours, rated capacity, MWh, outage-hours) — never pre-computed
   ratios. The ratio is only ever formed at the final step, at each level. This is a defining
   constraint on how these KPIs' *inputs* are specified.

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

**`dimension_key` uses the physical dimension names** that #2's PR #67 introduces —
`provider · category · technology · asset · unit · customer_type · payment_mode · band · division ·
gender · utility_function` — **not** the legacy `type / source / resource_type`. PR #67 physicalises
the energy columns (`energy_provider_id→provider_id`, `energy_type_id→category_id`,
`energy_source_id→technology_id`, `energy_resource_type_id→asset_id`, `energy_resource_id→unit_id`)
and rewrites the matching `energy_*` JSON keys in the legacy `kpi_definitions.formula_inputs`. Naming
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
one engine. Note this is distinct from §6: a *legitimately-not-yet-entered* input is "waiting"; an
input whose *measure is deleted/deactivated* is an error that surfaces a status.

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

The two biggest forks (11.1 engine topology, 11.2 compute home) are now **decided** (§4.4–4.5).
Everything in §5/§6 (the binding + integrity model) is the direction the design converged on.
**All open forks are now resolved** — 11.9 (drop "result level"), 11.11 (token on the binding), and
11.12 (cross-scope) all decided 2026-07-24. The design register carries no remaining open decisions.

---

## 12. Locked context this depends on

- **Energy taxonomy** — `asset → category → technology`, `unit` as the registry instance; one `All`
  per level; "all of category X" = `category = X, technology = All`. See
  `schema-redesign-medallion.md` §1.2a.
- **10 canonical dimensions** — `provider · asset · category · technology · customer_type ·
  payment_mode · band · division · gender · utility_function`.
- **Calculated shells** — the loader creates empty shells for calculated measures (counted in the
  relevance balance) and never migrates their values; this engine fills them. Medallion doc §4.2/§4.3.
- **KPI rebuild** — KPIs are rebuilt manually onto this model after the measure migration (§2).
