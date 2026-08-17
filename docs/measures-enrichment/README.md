# measures-enrichment — artifacts + regeneration

`measures-enriched-final.json` is the finalised measures catalogue (definitions, synonyms,
alternative names, flags) used to seed/verify `measure_definitions`. **The live DB is the source
of truth**; this JSON is a regenerated snapshot of it.

## Current state (regenerated 2026-08-17 from the live DB)

- **118 measures** — all `definition_status = 'curated'`, all with a definition + synonyms +
  alternative_names.
- **100 mandatory / 18 optional** (`is_mandatory`).
- Includes the new measure **id=440 "Electricity Sent to Grid"** and the 17 renamed measures
  (prefix strips "Apportioned Cost:" / "Direct Costs:"; downtime Count→Events, Duration→Hours).
- The JSON keeps its **historical key names** (`category_id`, `subcategory_id`, `agg_level_id`)
  for backward compatibility with existing readers, even though the DB columns are now
  `measures_group_id`, `measures_subgroup_id`, `strata_id`. A new `is_mandatory` key was added.

## How it was regenerated

A short DB→JSON dump keyed to the current schema (`measures_group_id` / `measures_subgroup_id` /
`strata_id`), remapped to the historical JSON keys above. See the git history for this session's
`.regen.mjs` pattern, or reuse the query in a fixed regenerator (below).

## ⚠️ Stale scripts (DO NOT RUN as-is — schema drift)

These predate the catalogue column rename (`category_id → measures_group_id`,
`subcategory_id → measures_subgroup_id`) and the energy-dimension physicalisation. They reference
columns that **no longer exist** and will error, or write the wrong shape:

| Script | Problem | Fix before reuse |
|---|---|---|
| `scripts/load-measures-and-scope.ts` | **STALE + DANGEROUS** — its own header says "run on prod at migration time", but the INSERT/UPDATE use `category_id`/`subcategory_id` (gone). Also predates `is_mandatory`/`is_apportionable`, and TRUNCATEs `measure_dimension_scope`. | Rename columns; add `is_mandatory` (+ `is_apportionable` once #4 adds the column); confirm the scope reload is still wanted. |
| `scripts/rebuild-enriched-from-db.ts` | STALE — SELECT uses `m.category_id`/`m.subcategory_id`. Superseded by the 2026-08-17 regen. | Rename columns, or retire in favour of the fixed regenerator. |
| `scripts/regenerate-all-artifacts.ts` | STALE — SELECT uses `m.category_id`/`m.subcategory_id`; also uses the old energy `DIMS` names for the scope/applicability dumps. | Rename columns; update `DIMS` to the physicalised dimension names. |

`is_apportionable`: present in Eugene's source workbook but **not yet a DB column** — owned by #4
(DDL: `is_apportionable boolean NOT NULL DEFAULT false`). Values are ready to load once it lands.
