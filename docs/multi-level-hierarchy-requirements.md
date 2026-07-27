# Multi-level data hierarchy — requirements handoff to #2 (medallion migration)

**From:** stream #8 (PRISM multi-level data hier) · **To:** stream #2, owner of all shared-table DDL (Eugene, 2026-07-26)
**Status:** design locked with Eugene 2026-07-24/26; this doc is the written form of it.
**Context:** replaces PRISM 1's *virtual generator / virtual service area* pattern with explicit
per-level anchoring ("Option A"; a reporting-entity supertype was considered and set aside).
Confirmed compatible with #3's `kpi_actual` proposal (calculator-engine-spec §4.4) on 2026-07-26.
**Terminology updated 2026-07-27** to the physicalised energy-dim names (PR #68): the level-1 anchor
is `unit_id` → `units` (formerly `energy_resource_id` → `energy_resources`).

---

## 1. The requirement in one paragraph

Every `data_entries` row must belong to **exactly one** real entity at **exactly one** of the five
collection levels — equipment/unit, power station, service area, organisation, country — via a real
FK, instead of everything hanging off `units` (the PRISM 1 generator table) with `is_virtual` rows
standing in for the upper levels. Which anchor column is populated *is* the row's level. `kpi_actual` reuses the same
anchor set (already agreed with #3).

## 2. Anchor columns on `data_entries`

| Level | Column | References |
|---|---|---|
| 1 Equipment / unit | `unit_id` (exists) | `units` |
| 2 Power station | `power_station_id` (new) | `power_stations` |
| 3 Service area / grid | `service_area_id` (exists) | `service_areas` |
| 4 Organisation | `organisation_id` (new) | `organisations` |
| 5 Country | `country_id` (new) | `countries` |

Constraints:

1. **Exactly-one-anchor:** `CHECK (num_nonnulls(unit_id, power_station_id,
   service_area_id, organisation_id, country_id) = 1)`.
2. **Derived level (recommended):** generated stored column `entry_level int` (1–5 by which anchor
   is set) so queries/AI can filter by level without a CASE.
3. **Level must match the measure:** each input/measure definition declares its collection level
   (`agg_level`); an entry's anchor level must equal it. Cross-table, so: trigger or app-layer at
   the choke point — #2's choice; #8 has a trigger sketch if wanted.
4. **Unique address must be `NULLS NOT DISTINCT`:** 4 of 5 anchors are NULL on every row; a default
   unique index treats NULLs as distinct and would dedupe nothing. #2's 10 NOT-NULL dims (All
   members) are fine as-is; the anchors are the reason for the flag. Same applies to `kpi_actual`.
   (PG 15+; else coalesce-expression index.)
5. **The old `uniq_entry` was never unique** (declared `index()`, not `uniqueIndex()`), so expect —
   and dedupe — pre-existing duplicate addresses during backfill *before* adding the real constraint.

The 10 medallion dimension columns are #2's spec and are untouched by this — anchors are the
"where", dims are the "what kind". The two axes compose; neither replaces the other.

6. **Anchors must point at real entities only — never sentinel/aggregate rows.** Post-PR #60,
   `countries`/`sub_regions` are UN M49-keyed and carry non-M49 **sentinel rows** ("All Countries",
   "Others") for UI/aggregation. A `data_entries` row anchored to a sentinel would reintroduce the
   virtual-generator problem at level 5 (a pretend entity holding real data). Enforcement mechanism
   is #2's choice (id-range check, `is_aggregate` flag, or app rule at the write path) — the
   requirement is that no entry/`kpi_actual` row may anchor to a sentinel. "All countries"
   aggregates are *computed* rollups, not stored addresses. Confirmed with #13 (2026-07-27): real
   entities are M49-keyed (codes ≤ 999) and sentinels use a disjoint id range (e.g. "All
   Countries" = 100000), so a simple `country_id < 1000` CHECK on the anchor would suffice.

7. **`country_context` fold-or-keep (flag, not blocker):** country-level explanatory data already
   lives in the `country_context` side-table. Once `country_id` anchoring exists, decide whether
   those data points migrate into `data_entries` (country-anchored, giving them the same
   status/workflow machinery) or `country_context` stays as a deliberate side-channel for
   sourced/reference values. #8 will bring a recommendation; #2 need not act on this in the first
   DDL pass.

## 3. Backfill: promoting entries off the virtual entities

The virtual rows themselves say where each entry really belongs
(`units.power_station_id` / `.service_area_id`; `service_areas.utility_id`;
`organisations.country_id`):

| Today's anchor | Promote to | Rule |
|---|---|---|
| virtual `unit` **with** `power_station_id` | `power_station_id` | station-level data parked on a station virtual |
| virtual `unit` without station | `service_area_id` | grid-level data parked on a grid virtual |
| virtual `service_area` | `organisation_id` (= `service_areas.utility_id`) | org-level data parked on a virtual area |
| org-anchored rows whose measure's `agg_level` = country | `country_id` (= `organisations.country_id`) | country-level data |

⚠ The virtual→level convention above is #8's read of the PRISM 1 data; **verify against the actual
rows** (e.g. `SELECT ... WHERE is_virtual GROUP BY agg_level_id`) before trusting it. Run in one
transaction with per-level row counts before/after; nothing may be dropped.

After no entries reference them: soft-delete virtual `units`/`service_areas` rows; drop
the `is_virtual` columns only once onboarding scripts / p1-import paths no longer create them.
`generation_relevance` / `generation_toggle_relevance` stay service-area-anchored — untouched.

## 4. RLS tenant column (#12's requirement — restated so it isn't lost)

The `organisation_id` **anchor** is not a tenant column (only populated on org-level rows). Carry an
explicit owning-org column suitable for a Postgres RLS policy on **both** `data_entries` and
`kpi_actual`: derivable at write time for equipment/station/area rows; NULL or a sentinel for
country-level (cross-utility) rows, with the policy deciding their visibility. Coordinate the
policy shape with #12 before finalizing.

## 5. Interaction with the submissions rename

Per the reconciled time-series design (board note, Eugene 2026-07-24): `report_periods` →
`submissions` (+ `period_id` FK to the canonical `period` dim; `report_type`/`report_date` fold
into `period`). #8 was to implement this rename; since #2 now owns the DDL it should land in the
same rework — the anchor work is orthogonal (WHERE vs WHEN) but touches the same table and the same
migration-extract contract, so land them as one coordinated change, not two migrations.

## 6. Out of scope for #2 (stays with other streams)

- `kpi_actual` column-set merge and its writer — #3 (pending #2's confirmation of the dim columns).
- App-layer query changes (entry screens querying by the right anchor per measure level; removal of
  `is_virtual` filters in reports) — #8/#11 after the schema lands.
- `kpi_target` / `kpi_limit` — #5 / #3 per existing board notes.
