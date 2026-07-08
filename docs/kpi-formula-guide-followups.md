# KPI Formula Guide — follow-up actions

The guide ships at `/settings/kpi-formula-guide` (DEV/BMO only), served from
`docs/kpi-formula-guide.html`. Created 2026-07-07. These are the items needed
for it to work end-to-end, plus the engine gaps the guide documents.

> **DIRECTION CHANGE (2026-07-08, BMO):** the migration scripts are being
> reworked to (1) **migrate raw inputs only** — PRISM 2 re-computes all
> calculated/aggregated inputs and KPIs — and (2) **remove all "All GEN" /
> "All Types" / "All Sources" dummy datasets**, with cross-source/level totals
> produced by the **gold layer** (sum raw inputs → re-apply stored formulas per
> level; the parked Phase-1 plan). Consequences for the items below:
> - **All GEN provider retag: CANCELLED** — the rows are being deleted, not
>   relabelled. Do not run a 21→20 retag.
> - **Item 7 (Any sentinel) is now REQUIRED, not optional** — with the All GEN
>   "total" rows gone, every "total across sources at the same level" must come
>   from a real aggregation (Any-sum in the worker, or the gold layer). The
>   "exclude derived-type-All" caveat is moot once All GEN is gone.
> - **Items 17–19 (deactivate All Conventional/Renewable, ESS, stray provider):
>   SUPERSEDED** by the wholesale removal of the All-* entries.
> - **Recent binding-tag work (SAIFI/Engine Oil provider=21/type=30/source=40;
>   the 153→1501 customers-served stopgap) will need re-verification/re-authoring
>   against the raw-only model.** The formula-TEXT bug fixes (findings 1/3/4/13)
>   and the engine robustness fix (resolveInputs newest-first/skip-blank) survive.
> - **Gold-layer Phase-1 work is now a hard dependency for KPI correctness**, not
>   just an AI/reporting enabler. Resume the parked `/to-issues` breakdown.

## To make the page live

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | Merge the `feat/kpi-formula-guide` PR to main | Eugene | pending |
| 2 | Deploy dev (`npm run deploy` from repo root, Git Bash) | Eugene | pending |
| 3 | Hand-run `db/migrations/0032_kpi_formula_guide_sidebar.sql` against the dev DB — `db-push` is schema-only and never applies data migrations | Eugene | pending |
| 4 | Verify as BMO on dev: Settings shows a "KPI Formula Guide" card (works even before step 3) and the sidebar link appears (needs step 3); opening the page renders the guide; a BLO/CEO login gets 403 | Eugene | pending |

## Engine gaps the guide documents (each needs a decision or fix)

| # | Action | Why | Status |
|---|---|---|---|
| 5 | Re-author `IPP Generation` (KPI id 104) and `Renewable Energy to Grid` formula_inputs: distinct variable names per filter combination + provider/type scoping | Both currently compute value ÷ itself = always 100% (DATA-QUALITY finding #5, now confirmed) | pending |
| 6 | Key stored KPI results by level + scope (gold-layer `fact_kpi`; consider fixing `kpi` table / `persistKpi.ts` too) | Today one value per (report period, KPI def) — sub-utility results overwrite each other | pending (Phase-1 slices 4/6) |
| 7 | Add an explicit "Any" filter option to formula inputs. DESIGN (revised 2026-07-08 after discovering the **All GEN convention** — see `scripts/check-all-any-usage-v2.ts` + `scripts/check-all-gen-convention.ts`): the dev DB has 92 **virtual resources** (source = "All GEN" item 40, derived type = "All" item 30) carrying **38,126 rows** of not-split-by-source data (Installed Capacity, Electricity Generated, Downtime, tariffs, fuel). So "total" rows are not unlabelled — they are labelled *All GEN*, and because their derived type is "All" (not Renewable/Conventional), type-scoped formulas naturally exclude them. KEEP items 40 + 30 (retracts the earlier "remove item 30" note — it is the load-bearing parent). Formula rule for totals: scope `source = All GEN` (works today). The `-1` ANY sentinel (named constant; not a string — `normalizeFormulaInput`'s `Number()` coercion drops strings) remains useful for cross-label sums where no All GEN row exists, but MUST exclude rows whose derived type is "All" — 183 scopes already contain BOTH an All GEN total and per-source detail rows, so a naive "match everything" double-counts. Builder `all`/`*` keywords map to `-1` (today they map to null = wrong) | Blank filter currently means "rows with no label", not "all rows"; and the Any semantics must respect the All GEN aggregate-row convention | pending |
| 8 | Add Power Station as a pickable aggregation level (managed list item + calculation scope wiring) | Level 2 of the 7-level hierarchy; generators already belong to stations but no station-level KPIs are possible | pending |
| 9 | Give aggregation levels an explicit sort order (not managed-list item IDs) | `shouldRollup` compares raw IDs; inserting a new level between existing ones would break the coarser-than check silently | pending |
| 10 | Update the guide when #7/#8 land (Part 4 blank-filter warning, Part 2/7 station-level status) | Keep the doc truthful | pending |

## Energy-dimension list cleanup (assessed 2026-07-08, dev DB)

| # | Action | Why | Status |
|---|---|---|---|
| 17 | Deactivate **"All Conventional"** (source item 41) and **"All Renewable"** (source item 42) — zero data rows, zero formula bindings | Their parents are Conventional/Renewable, so a per-type total row ever tagged with them would derive a real type and **double-count inside every type-scoped formula**. Remove before anyone uses them; per-type totals are already expressible as type-scoped sums of detail rows | pending — DECISION NEEDED (also re-check on prod first) |
| 18 | **ESS modelling decision.** Battery (43) and Hydro Pumped Storage (51) are typed *Renewable*, so every renewable-scoped KPI currently includes storage, and nothing can isolate or exclude ESS as a class. "All ESS" (58, parent "All", zero usage) exists but has no members concept | Decide: (a) does renewable share include storage? (b) if ESS must be separable, add a source *class* facet (Generation vs Storage) rather than more dummy sources | pending — DOMAIN DECISION |
| 19 | Data-quality: one energy_resource has provider = "All" (20) + type = Renewable — fix, then provider "All" (20) is removable (zero data rows); and the 183 scopes where an All GEN total coexists with per-source detail rows are a validation-at-entry opportunity (total should equal sum of details) | Stray reference blocks clean removal; coexisting rows are the double-count surface | pending |

## Formula Builder UI changes (`/settings/kpi` — assessed 2026-07-08)

The builder already supports per-variable dimension filters (inline
`WHERE provider=… AND type=… AND source=…` syntax, parsed into
`formula_inputs` ids and reconstructed on load) and a live preview using the
real engine evaluator. But it cannot express the guide's core pattern:

| # | Change | Why | Status |
|---|---|---|---|
| 11 | **Alias support — the blocker.** Tokens are the input definition's canonical `variable_name`; filters are keyed by input id; `getFormulaInputs` dedups by `input_def_id`. One input = one binding = one filter set, so "same input twice with different filters" (renewable share, IPP share) is impossible to author — which is exactly how IPP Generation became X÷X. The engine already supports aliases (bindings keyed by free-text `variable_name`); the UI needs alias creation on drop (suggest `<variable>__<filter>`), filters keyed by token not input id, and dedup by variable name | Blocks re-authoring the two always-100% KPIs (item 5) | pending |
| 12 | Fix `all`/`*` WHERE values: `parseInlineFormula` maps them to null, which the engine reads as "unlabelled rows only", and unfiltered tokens display "All filters" — the UI actively teaches the wrong semantics. Pair with the engine "Any" option (item 7) or warn until it exists | Silent wrong numbers | pending |
| 13 | Validation: same token with two different WHERE clauses silently merges (last-wins in `effectiveInputFilters`); should error and point to aliases. Also flag recipe tokens bound to nothing | Guardrail for the naming rule | pending |
| 14 | Surface levels in the builder: show the KPI's output level and each input's level + a "rows will be summed" indicator (agg_level editing already exists on the KPI definition form on the same page) | Author currently gets no roll-up signal | pending |
| 15 | Preview with real data + roll-up: the service already ships `actualSamples` (real rows with dimension ids) but the preview ignores them and hash-generates one value per token. Filter samples per binding and SUM them (mirroring `resolveInputs`) so filter mistakes and the blank-filter trap surface before saving | Preview currently can't catch the bugs this guide is about | pending |
| 16 | Review `app/settings/inputs/formulaBuilder.tsx` (aggregated-input builder) for the same gaps once 11–15 are settled | Shares the design | pending |

## Related, already tracked elsewhere

- Remaining formula bugs from the dictionary pass (Total Employees Male, Planned
  SAIDI/SAIFI, Generator Availability Factor parens, Engine Oil Consumption
  unit inversion) — see `docs/dictionary-drafts/DATA-QUALITY-FINDINGS.md`.
- BMO curation of the 245 draft dictionary definitions.
