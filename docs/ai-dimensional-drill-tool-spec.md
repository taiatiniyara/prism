# AI Dimensional Drill Tool — Scope & Design

**Status:** Draft for review · **Author:** session `eugen-61` (#3 calculator), scoping at Eugene's request 2026-09-20
**Owner (implementation):** AI/PBI stream · **Consulted:** #3 (calculator resolver / dimension model)
**Related:** [PR #490](https://github.com/taiatiniyara/prism/pull/490) (the tactical `generation_mix_trend` fix that surfaced this gap), [calculator-engine-spec.md](calculator-engine-spec.md) §4.6 (fact resolution + rollup), [per-period-participation-spec.md](per-period-participation-spec.md)

---

## 1. Problem & goal

The in-app AI assistant can only answer what a **fixed, hand-authored catalog** allows. Its data access is two curated surfaces:

- **Power BI DAX templates** (`lib/ai/data-service/pbi-queries.ts`) — ~60 pre-written queries, each pinned to specific columns/grains.
- **PRISM-native tools** (`lib/ai/tools/prism-native.ts`) — ~40 typed tools, each wrapping a purpose-built service function.

Neither reaches the **fact grain** (`data_entries`) generically. So a question like *"plot the energy mix by source across years"* only works if someone pre-authored a query for that exact measure × dimension × time cut. When they hadn't, the assistant wrongly told a user "the gold layer only stores a ratio" (see PR #490 root cause). Every new "drill into X by Y" question needs a new hand-written query.

**Goal:** one tool that lets the assistant drill **any measure × any of the canonical dimensions × any period**, reading the fact grain directly, with correct access control, correct value handling, and correct rollup — so "drill to the lowest level" becomes a general capability, not a per-question engineering task.

**Non-goals:** free-form SQL from the model; writes of any kind; bulk export; replacing the curated tools (they stay as fast paths for common questions).

---

## 2. What already exists to reuse (do NOT re-derive)

| Need | Reuse this | Location |
|---|---|---|
| Tool shape (zod schema + execute) | `tool({ description, inputSchema, execute })`, factory `createPrismNativeTools(user, abortSignal, sessionId)` | `lib/ai/tools/prism-native.ts` |
| **Row-level access predicate** | `periodAccessPredicate(user)` — non-global users see only their org; global (BMO/DEV via `hasGlobalUtilityAccess`) see other utilities' **Financial Year** periods only, never their Monthly private data | `lib/ai/data-service/common.ts` |
| Benchmarking participation gate | `benchmarkingParticipantCondition()` / `isBenchmarkingParticipant(utilityId, periodId)` | `lib/benchmarking/participation.ts` |
| Dimension→column breakdown precedent | `getCompletenessBreakdown` + its `CompletenessDimension` switch already maps dims to `data_entries` columns + managed-list joins | `lib/ai/data-service/completeness.ts` |
| Measure name → id resolution (synonyms) | the KPI/measure synonym resolver used by `compareKpisAcrossUtilities` and `advanced.ts` | `lib/ai/data-service/*` |
| Fact resolution + additive rollup semantics | the calculator resolver (`resolveFormulaInputValues`, `dimension-rollup.ts`, `fact-resolver.ts`) | `app/data-entry/enter-data/services/aggregated-worker/` |
| Guardrails | `validateToolAccess`, `validateInput` (prompt-injection / bulk-export / PII), `filterOutput` | `lib/ai/guardrails.ts` |
| Chart handoff | `render_visualization` tool + `{rows, seriesKeys}` chart contract | `lib/ai/tools/prism-native.ts`, `components/ai/visualizations/` |

**Key reuse principle:** the tool is mostly **wiring**, not new machinery. Its correctness comes from delegating access, resolution, and rollup to the code that already owns them.

---

## 3. The data model it queries

`data_entries` is the fact grain. One measured value per row, addressed by:

- **Identity/grain:** `report_period_id` (→ `report_periods.utility_id`, `.report_date` ⇒ fiscal year), `unit_id`, `power_station_id`, `service_area_id`, plus geo (`country_id`, `subregion_id`, `region`).
- **Measure:** `measure_def_id` (→ `measure_definitions`: `name`, `is_additive`, `is_calculated`, `is_system_generated`, `unit`, `data_type`).
- **Dimension FK columns:** `provider_id`, `technology_id`, `customer_type_id`, `payment_mode_id`, `consumption_band_id`, `division_id`, `gender_id`, `utility_function_id`, `asset_class_id`, `category_id` — each → `managed_list_items` (id, list_id, parent_id, name, is_active).
- **Value (typed):** `value_numeric`, `value_boolean`, `value_text`, `value_option_id` (+ legacy `value`, `multiplier`).
- **Flags:** `is_deleted` (exclude `true`), `is_relevant`, plus status via `status_id`.

The **10 canonical dimensions** (`MEASURE_DIMENSIONS` in `db/schema/measureDimensionScope.ts`): `provider, type, source, resource_type, customer_type, payment_mode, band, division, gender, utility_function`. `measure_dimension_scope` records, per measure, which dimensions it expands on and how (`expansion_mode`: `not_applicable | all_members | by_context`).

### 3.1 ⚠️ The mapping problem (must be fixed as part of this work)

The canonical dimension **name**, the physical **column**, and the code **alias** do not line up 1:1 and the mapping is **scattered**, e.g.:

- canonical `resource_type` ⇄ column `technology_id` ⇄ code alias `energySource` (managed list "Technology")
- canonical `band` ⇄ column `consumption_band_id` ⇄ code alias `consumptionBand`

There is **no single authoritative `DIMENSION → {column, managedList, alias}` table** today; it's implied across `enter-data*/service.ts`, the aggregated-worker `target-writer.ts`, and `completeness.ts`. **This tool must not add a fourth hand-rolled copy.** First deliverable is to **centralize the map** (one exported constant, single source of truth) and refactor the drill tool + ideally `completeness.ts` onto it. Getting this wrong = silently querying the wrong column.

---

## 4. Proposed tool contract

One native tool, `drill_measure` (name TBD), registered in `createPrismNativeTools`.

```ts
inputSchema: z.object({
  measure: z.string().describe(
    "Measure name or synonym, e.g. 'Electricity Generated', 'generation', 'system losses'. Resolved via the measure synonym resolver."),
  breakdown_by: z.array(z.enum(CANONICAL_DIMENSIONS)).optional().describe(
    "Canonical dimension(s) to split by, e.g. ['resource_type'] for diesel/solar/wind. Omit for the utility-level total."),
  over_time: z.boolean().optional().describe(
    "Return one row per fiscal year (time series) instead of a single period."),
  utility: z.string().optional().describe(
    "Utility acronym/name. Defaults to the user's own utility; cross-utility requires global access + is FY-only."),
  fiscal_year: z.string().optional().describe(
    "Single FY (e.g. 'FY2023'). Ignored when over_time is true."),
  // NB: no free-form filters, no raw SQL, no arbitrary columns.
})
```

**Output** (`AiToolResult`): tidy long-format rows the viz layer already understands —
`{ measure, unit, is_additive, rows: [{ fiscal_year?, <dimension>?: memberName, value, coverage: { entered, total } }], notes: string[], access_scope }`
— plus `notes` for caveats ("Wind has no data entered for FY2024–25, shown as gaps") and a `recommended_chart` hint (`over_time && breakdown_by` ⇒ stacked bar).

**Worked example** — *"energy mix for Tonga Power 2022–25"* →
`{ measure: "Electricity Generated", breakdown_by: ["resource_type"], over_time: true, utility: "TPL" }` → rows `(FY, resource_type, MWh)` → stacked bar. Exactly the case PR #490 patched, now general.

---

## 5. Value handling & rollup semantics

- **Typed values:** pick the column by `measure_definitions.data_type` — `value_numeric` for numeric measures (never the legacy `value`, which is why an earlier probe summed to `NULL`); `value_boolean` / `value_text` / `value_option_id` for the rest. Non-numeric measures can be broken down/counted but not summed.
- **Rollup = SUM additive inputs, then apply — never average ratios.** When collapsing sub-grain rows (multiple units/stations) or unrequested dimensions into a total, **sum** only when `is_additive`; refuse/annotate for non-additive measures. This is the same rule as [calculator-engine-spec.md](calculator-engine-spec.md) §4.6 — reuse the resolver's rollup, don't reimplement, so the tool and the calculator can never disagree.
- **Sliced vs aggregate:** a measure may be entered as an aggregate ("All" member) OR split per member. Surface both honestly; don't double-count aggregate + members (the "All" trap from the coverage work).
- **Blanks are gaps, not zeros.** A member-year with no row (or a shell with no value) is *missing*, reported in `coverage`, and rendered as a gap. Only zero-fill where the measure/input is genuinely optional (mirrors the optional/mandatory model already in the engine).

---

## 6. Access control & safety (hard requirements)

1. **Row-level:** every query ANDs in `periodAccessPredicate(user)`. A utility user can never read another utility's rows; global users get FY-only cross-utility. No exceptions, no bypass param.
2. **Participation:** benchmarking reads gate on `isBenchmarkingParticipant` where the curated tools already do.
3. **Structured only:** the model supplies *parameters* (measure name, dimension enum, FY string), never SQL, column names, or predicates. The query is assembled server-side from the whitelisted dimension map. This is the single most important safety property — it makes injection structurally impossible, unlike a SQL sandbox (§8 option B).
4. **Bounded:** hard row cap + default period scoping; reject unbounded "all measures × all dims × all periods" fan-outs (the bulk-export guardrail in `validateInput` already blocks the phrasing; enforce in the tool too).
5. **Guardrails:** run through `validateToolAccess` / `filterOutput`; wrap in `withTimeout(PBI_TOOL_TIMEOUT_MS)`.
6. **Read-only:** selects only. No transaction, no write path reachable.

---

## 7. Design options & trade-offs

**Option A — Parameterized structured drill tool over `data_entries` (RECOMMENDED).**
Whitelisted measure + dimension enums → server assembles the SQL. ➕ Injection-proof, reuses access/rollup, predictable cost, tidy output the viz layer takes as-is. ➖ Only the shapes we parameterize (measure × dims × time); exotic cross-measure math still needs the calculator. *This is the right 90% tool.*

**Option B — Guarded read-only SQL sandbox** (model writes SELECTs against a restricted role/views).
➕ Maximally flexible. ➖ Huge attack surface (injection, resource exhaustion, data-scope leaks through joins), very hard to guarantee `periodAccessPredicate` on every generated query, and the RLS story on `data_entries` would have to be airtight. **Rejected for now** — reconsider only behind a per-utility RLS role, never as the first step.

**Option C — Keep extending the PBI DAX catalog per dimension** (what PR #490 did).
➕ Zero new infra, fits the existing pattern. ➖ Doesn't generalize — it's the very treadmill this scope exists to end. Fine for one-offs; not the answer.

**Recommendation:** ship **A**. Keep **C** for genuinely bespoke asks. Revisit **B** only if A's parameter space proves too narrow *and* per-row RLS lands.

---

## 8. Edge cases

- Measure not scoped to the requested dimension (`measure_dimension_scope.expansion_mode = not_applicable`) → return the total + a note, don't invent a split.
- Mixed value types across a breakdown → refuse to sum, present as table.
- Hierarchical managed-list members (`parent_id`) → decide roll-to-parent vs leaf; default leaf, note it.
- `service_area`/grain columns that are display-only (per multi-sector work, `service_area` is a label) → don't treat as a slicing dimension unless intended.
- Non-participating / withdrawn periods → excluded by the participation gate; say so rather than showing gaps that look like missing data.
- Provider-pin mismatches (the KPI-26 class of bug) → coverage/notes must make "entered at a different pin than requested" visible.

---

## 9. Phasing

1. **P0 — Centralize the dimension map** (`DIMENSION → {column, managedList, alias, canonicalName}`), refactor `completeness.ts` onto it. *Unblocks everything; independently valuable.*
2. **P1 — `drill_measure` MVP:** numeric measure, single FY, one optional `breakdown_by`, own-utility scope, tidy rows + coverage. No rollup beyond SUM-additive.
3. **P2 — Time series + cross-utility** (`over_time`, `utility` with `periodAccessPredicate`), stacked-bar chart hint, `render_visualization` handoff.
4. **P3 — Rollup depth & non-numeric** (grain + multi-dimension rollup via the calculator resolver; boolean/text/option counts).
5. **P4 — Guardrail hardening & eval:** row caps, fan-out limits, prompt-catalog description so the LLM prefers this over the ratio fallback; add eval cases (the energy-mix question as a regression).

MVP that would have prevented the PR #490 incident = **P0 + P1 + the `over_time` half of P2**.

---

## 10. Open questions (for Eugene / AI stream)

1. **Scope of P0 refactor** — centralize the dimension map repo-wide (touches `completeness.ts`, enter-data, aggregated-worker), or a local map for the tool now and refactor later? (Recommend repo-wide; it's the root cause of a class of "wrong column" bugs — but it's cross-stream.)
2. **Cross-utility default** — should the tool ever auto-widen to all utilities for a benchmarking user, or always require an explicit `utility`/`all_utilities: true` like `get_benchmarking_data`?
3. **Gold vs fact** — some measures also live pre-aggregated in `gold.*` (e.g. `gold.dim_utility`). Prefer gold when the cut matches (cheaper) and fall to `data_entries` for finer grain, or always fact for consistency?
4. **Ownership** — AI/PBI stream implements; **#3 (calculator)** owns the resolver/rollup + dimension-map reuse so the drill tool and the engine stay in lockstep. Confirm this split.

---

## 11. Summary

The assistant's "can't drill" limitation is a **catalog gap, not a data gap**. A single parameterized `drill_measure` tool over `data_entries` — reusing the existing access predicate, participation gate, measure resolver, and calculator rollup, on top of a **centralized dimension map** — turns "drill to the lowest level" into a general capability and retires the per-question DAX treadmill. Recommended path: Option A, phased P0→P2, with the dimension-map centralization (P0) as the load-bearing first step.
