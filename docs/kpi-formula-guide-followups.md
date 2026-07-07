# KPI Formula Guide — follow-up actions

The guide ships at `/settings/kpi-formula-guide` (DEV/BMO only), served from
`docs/kpi-formula-guide.html`. Created 2026-07-07. These are the items needed
for it to work end-to-end, plus the engine gaps the guide documents.

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
| 7 | Add an explicit "Any" filter option to formula inputs. DESIGN (settled 2026-07-08): "Any" is a *matching rule* on the formula binding, NOT a managed-list row — remove the "All" entries added to the dimension lists (dev DB has two: Energy Provider item 20, Energy Type item 30; zero references in data_entries or formula_inputs, verified via `scripts/check-all-any-usage.ts`, so removal is clean; re-run the script on prod before removing there). Replace with a sentinel on the binding: reserve `-1` (named constant, e.g. `ANY_DIMENSION`) in `energy_provider_id` / `energy_type_id` / `energy_source_id` — a string like `"any"` would be silently dropped by `normalizeFormulaInput`'s `Number()` coercion. Semantics per dimension: specific id = match that label; `null` = match unlabelled rows only (unchanged, keeps aggregate-row targeting); `-1` = no constraint, candidates span all labels and the roll-up sums them. Do NOT redefine `null` to mean "any": inputs that have both an unlabelled aggregate row and labelled detail rows in the same scope would double-count. Builder follow-through: map the `all`/`*` WHERE keywords and the dropdowns to `-1` (today they map to null = wrong) | Blank filter currently means "rows with no label", not "all rows"; totals depend on the sum-of-parts workaround | pending |
| 8 | Add Power Station as a pickable aggregation level (managed list item + calculation scope wiring) | Level 2 of the 7-level hierarchy; generators already belong to stations but no station-level KPIs are possible | pending |
| 9 | Give aggregation levels an explicit sort order (not managed-list item IDs) | `shouldRollup` compares raw IDs; inserting a new level between existing ones would break the coarser-than check silently | pending |
| 10 | Update the guide when #7/#8 land (Part 4 blank-filter warning, Part 2/7 station-level status) | Keep the doc truthful | pending |

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
