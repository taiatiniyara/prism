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
| 7 | Add an explicit "Any" filter option to formula inputs | Blank filter currently means "rows with no label", not "all rows"; totals depend on the sum-of-parts workaround | pending |
| 8 | Add Power Station as a pickable aggregation level (managed list item + calculation scope wiring) | Level 2 of the 7-level hierarchy; generators already belong to stations but no station-level KPIs are possible | pending |
| 9 | Give aggregation levels an explicit sort order (not managed-list item IDs) | `shouldRollup` compares raw IDs; inserting a new level between existing ones would break the coarser-than check silently | pending |
| 10 | Update the guide when #7/#8 land (Part 4 blank-filter warning, Part 2/7 station-level status) | Keep the doc truthful | pending |

## Related, already tracked elsewhere

- Remaining formula bugs from the dictionary pass (Total Employees Male, Planned
  SAIDI/SAIFI, Generator Availability Factor parens, Engine Oil Consumption
  unit inversion) — see `docs/dictionary-drafts/DATA-QUALITY-FINDINGS.md`.
- BMO curation of the 245 draft dictionary definitions.
