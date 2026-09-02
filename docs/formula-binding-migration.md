# formula_binding migration (#238)

`formula_binding` / `formula_binding_dimension` are the source of truth for a
formula's inputs (spec §5.3). The legacy `kpi_definitions.formula_inputs` /
`measure_definitions.formula_inputs` JSON is a derived cache. This is the
sequence to finish retiring the JSON.

## Status

| Step | State |
|---|---|
| Resolver reads `formula_binding`, JSON fallback | **done** — PR #330 (`app/data-entry/kpi-worker/formula-bindings.ts`, wired into `resolveTargets`, the AI calculator, and `aggregated-worker/target-selector`) |
| Backfill bindings for the ~75 JSON-only active KPIs | **script ready** — `scripts/backfill-formula-bindings.ts` |
| Delete the JSON read fallbacks | follow-up (after backfill verified) |
| Stop writing `formula_inputs` in `saveUnifiedFormula` + drop the columns | follow-up |

## Backfill

```
node --env-file=.env --import tsx scripts/backfill-formula-bindings.ts          # dry run
node --env-file=.env --import tsx scripts/backfill-formula-bindings.ts --apply   # write (transactional)
```

Only owners with **zero** existing binding rows are touched — safe to re-run.
It reconstructs the exact `FormulaInput[]` the JSON holds; PR #330 verified this
is byte-identical for all 54 already-bound KPIs.

Dry run as of 2026-09-03: **75 KPIs → 160 `formula_binding` + 1600
`formula_binding_dimension` rows**; both calculated measures already bound.

### After `--apply`

Re-run the equivalence check (the query in PR #330's description) — every active
KPI's binding-derived inputs must still match its JSON. Then the JSON read
fallbacks can be deleted.

## git before DB

The script is committed here first. Apply it against p2 only after this merges.
Run `npm run db-seed` is **not** needed (no reference data touched).
