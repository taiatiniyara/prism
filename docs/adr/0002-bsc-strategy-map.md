# ADR 0002 — BSC Strategy Map: causal links as a per-Utility overlay relation

- Status: **Accepted**
- Date: 2026-06-12
- Related: [docs/bsc-builder-spec.md](../bsc-builder-spec.md) §13, [ADR 0001](0001-bsc-builder.md)

## Context

The BSC Builder (ADR 0001) stores a utility's scorecard as an 8-level **decomposition tree** (parent → child). A Kaplan–Norton **strategy map** is a different artifact: a one-page diagram of objectives grouped into the four perspectives, connected by **cause-and-effect arrows that cross perspectives** (Learning → Process → Customer → Financial). The tree's parent/child links express *containment*, not *causality* — so the map's defining feature is not derivable from the existing structure.

Two render options were considered:
- **(a)** A structured "objectives by perspective" view derived straight from the tree — cheap, no new data, but the arrows would only restate containment.
- **(b)** A true causal map with explicit objective→objective links — more work, but the version that actually communicates strategy.

A Tier-1 preview from the seeded template also surfaced two facts: L4 labels are full sentences (unusable as map captions), and Financial's map-worthy names live at L3, not L4.

## Decision

Build the **true causal strategy map (option b)**.

- **Causal edges are a per-Utility overlay relation**, `bsc_objective_link` (`source_node_id` / `target_node_id` → `bsc_utility_node`, cascade delete). Causality is a strategic judgment each utility makes — consistent with "BSC is a flexible strategy-formulation tool," not a benchmarking artifact. Edges are never seeded.
- **"On the map" is an explicit flag (`is_map_node`), not a level rule.** This lets Financial promote its `key_focus_area` while every other perspective uses `strategic_objective`. Template carries PPA defaults; the overlay carries nullable overrides (null = inherit).
- **`map_label`** (short caption) is separate from the BSC `label` (the full sentence), resolved `coalesce(utility, template, label)`.
- **`relation` column kept** (`drives` default; `enables`/`constrains` reserved) for future arrow styling — cheap now, avoids a later migration.
- **Both auto-layout and drag-to-position ship in v1.** Auto-layout by (perspective band, theme column, `ord`); `map_x`/`map_y` override per node, written only on drag.
- **The map reads through the existing BSC Preview filter** (mandatory + selected/populated), realising the merge deferred in spec §12.

## Consequences

- One new table + four columns (migration `0028_bsc_strategy_map.sql`), and seed annotations for `map_label` / `is_map_node`.
- Edge integrity (`source ≠ target`, same-utility endpoints, both endpoints are map nodes) is enforced in the service layer, not by DB constraints that can't span FKs. Cycles are **warned, not blocked**.
- `is_map_node` as a flag (vs a `level === 'strategic_objective'` heuristic) costs a column but cleanly handles the Financial L3-promotion and any future per-utility deviation.
- Drag-to-position adds UI/state work in v1 (vs auto-layout-only); accepted because hand-tuned placement is expected for a board-facing one-pager.
