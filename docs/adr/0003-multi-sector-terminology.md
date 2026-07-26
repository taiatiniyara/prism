# ADR 0003 — Sector-driven terminology (keep generic storage; label by sector)

- Status: **Accepted** (initiated by Eugene 2026-07-26; all open questions ratified 2026-07-27 by #8 / #10 / #11 + Eugene — see resolutions doc)
- Date: 2026-07-26 (accepted 2026-07-27)
- **Open questions worked → resolutions (2026-07-27, stream #13): [docs/multi-sector-terminology-resolutions.md](../multi-sector-terminology-resolutions.md) — ✅ all five ratified.** Q1 labels = Grid / Supply Zone / Catchment (Eugene); Q2 sector-specific areas (#8); Q3 `sector_terminology` table + shared resolver (#11); Q4 sector orthogonal, `organisation_sector` M:N (#10); Q5 Phase-5a go (Eugene).
- Related: [docs/schema-redesign-medallion.md](../schema-redesign-medallion.md) §0.2 ("IDs in the tables, names in the views"), [docs/WORKSTREAMS.md](../WORKSTREAMS.md) streams #8 (multi-level hierarchy), #10 (two-axis org model), #11 (UI)

## Context

PRISM's data model uses **`service_area`** as a deliberately generic term for what electricity users call the **grid** (a utility's area of reach). The generic word was chosen up front to keep the door open for PRISM to also benchmark the **water** and **sanitation** sectors, where "grid" does not apply.

Two things now push on that choice:

1. **Relatability.** Utilities and industry users want terminology that matches *their* sector. Electricity users expect "Grid" / "Network"; water users think "Supply Zone" / "Distribution Zone" (DMA); sanitation users think "Catchment" / "Sewershed" / "Collection Zone". A single generic word feels unfamiliar to everyone.
2. **Multi-sector utilities.** The **same utility may provide electricity, water, and sanitation services.** So the sector is **not** a property of the utility — a naive "rename `service_area` → `grid`" would be wrong for that utility's water and sanitation operations.

Compounding this: the current model is **electricity-shaped end to end** — `energy_provider` / `energy_type` / `energy_source` dimensions, `utility_function` (Generation / Transmission / Distribution / …), MWh/currency units, and a 117-measure catalogue that is entirely electricity. Terminology is only the visible tip of a much larger multi-sector question.

## Decision

Adopt **sector-driven terminology**. Concretely:

1. **Do NOT rename physical columns/tables to sector-specific words.** No `service_area → grid`. Renaming would (a) re-bake electricity into the schema — the very bias the generic term avoided, just inverted; (b) break the moment water/sanitation arrive; and (c) cost another full migration (column + FKs + the 17-column `uniq_entry_address` + code + docs). Keep `service_area` as the **stable, sector-neutral storage concept** ("the area a utility serves" — a term water and sanitation utilities also use).

2. **Terminology is a presentation-layer concern.** The *displayed* word is resolved from a **`sector → label`** map ("Grid" / "Supply Zone" / "Catchment"), consistent with the medallion principle *"IDs in the tables, names in the views."* This is config/lookup, not a schema change, and it generalizes beyond `service_area` (provider, source, units, functions all get per-sector labels eventually).

3. **Introduce `sector` (Electricity / Water / Sanitation) as a first-class concept.** It drives three things at once: the **terminology**, which **dimensions** apply, and which **measures** are relevant.

4. **Model sector on the service / area / measure — not on the utility.** A `service_area` (or a utility's operation within it) belongs to a sector; a measure belongs to a sector. **Utility ↔ sector is many-to-many** ("this utility operates in these sectors"). Benchmark **within** a sector; a multi-sector utility appears in each relevant sector's benchmark on its own slice. The **active sector in the filter context** drives labels and relevance, so flipping from Electricity to Water re-labels the UI, swaps the applicable dimensions, and filters to that sector's measures.

5. **Sequence it — do not conflate the label layer with the full build.** The `sector → label` layer is a low-cost near-term win (electricity UX can read "Grid" via a pure label change, zero storage impact). **Full water/sanitation modelling** — their own dimensions, measures, units, and relevance — is a **separate, deliberate initiative** and must **not** block or ride on the current electricity migration (#2).

## Consequences

- **Near term:** add a `sector` concept + a per-sector terminology map (first entry: `service_area`), and add sector to the filter context. Zero storage migration for the rename concern; the electricity "Grid" label is a config change.
- **Deferred / separate initiative:** water & sanitation dimension sets, measure catalogues, units, and relevance; the utility↔sector relationship; benchmark-within-sector semantics.
- **Cross-stream** — this is a product/architecture direction, not a migration-stream rename. It touches:
  - **#8** — `service_area` is a *level* in the hierarchy #8 is redesigning; sector-tagging areas lands here.
  - **#10** — utility↔sector fits alongside the existing two-axis (`entity_type` / `relationship`) org model.
  - **#11** — owns surfacing the per-sector terminology in the UI.
  - **Catalogue + AI/gold** — sector gates which measures/dimensions/labels the AI and dashboards expose.
- **Risk if ignored:** renaming to "grid" now would re-bias the schema to electricity and force a re-migration when water/sanitation land — the opposite of the goal.

## Open questions (for the owning streams / domain experts)

> **Worked into proposed answers by stream #13 (2026-07-27) — see [docs/multi-sector-terminology-resolutions.md](../multi-sector-terminology-resolutions.md).** Summary: labels are BMO-editable data (not a blocker); `service_area` gets a `sector_id` (sector-specific rows, backfill Electricity); a dedicated `sector_terminology` table + `sectors` reference resolve labels at Silver/UI; `sector` is a third orthogonal concept (`organisation_sector` M:N junction, org axes untouched); ship the relabel now, defer full water/sanitation modelling off #2's path. **Awaiting ratification by #8 / #10 / #11 + Eugene.**

- **Exact per-sector labels** — e.g. is the electricity term "Grid", "Network", or "Service Territory"? ("Grid" strictly means the physical network, not the served *territory*.) Water: "Supply Zone" vs "DMA" vs "Service Area"? Sanitation: "Catchment" vs "Sewershed" vs "Collection Zone"?
- **Is a `service_area` shared geography across sectors, or sector-specific rows?** (One physical territory tagged with a sector, vs separate area rows per sector for the same geography.)
- **Where does the terminology map live** — a dedicated `sector_terminology(sector_id, concept_key, label)` table, app config, or the existing managed-lists system?
- **How does `sector` interact with #10's `entity_type` / `relationship` axes** — is it a third axis, or a property of the service?
- **Timing** — design the direction now; when is the label layer worth shipping, independent of the water/sanitation modelling?
