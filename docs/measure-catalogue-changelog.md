# Measure catalogue — change log

An append-only audit trail of curation changes to `measure_definitions` (and its
scope/applicability) during the PRISM 1.0 → 2.0 migration. Newest change set at the top.
Changes are grouped into deliberate **passes** (see 2026-07-23 sequencing decision: rename
first, renumber ids second) so each is verifiable in isolation.

---

## 2026-07-23 · Pass 2b — Delete redundant measure 440

`440 Electricity Sent to Grid` is redundant — the concept is catered for under
`302 Electricity Sold to Customers`. Rationale: transmission-level electricity is never a retail
sale; "sent to grid" is a **bulk sale** to another utility or a large industrial off-taker, so it
is a sale to a customer (a bulk buyer) and belongs under 302. Deleted completely (hard delete; CASCADE
removed its 10 scope rows, 1 applicability row, 1 stale mapping row — `data_entries` empty).
Pre-delete snapshots in `backup` schema (`measure_440_pre_delete`, `scope_440_pre_delete`,
`appl_440_pre_delete`, `maps_440_pre_delete`). Catalogue: 118 → **117** (active 116 → **115**).

**Coverage note:** with 440 gone, every active measure is now accounted for against the p1→p2
map — mapped, calculated (230 Total Costs, 231 Profit — excluded by RAW-ONLY), or an intentional
new-p2 measure with no p1 source (**303 Non-Revenue Electricity Consumed** — empty shells).

---

## 2026-07-23 · Pass 2 — Id renumber (compact blocks)

Renumbered ids into contiguous blocks. Executed in dependency-safe order (Solar out to 360s →
Network into freed 340s → Equipment into 332/333) so no target was ever occupied — the 340–343
overlap (both source and target) was the only hazard. Mechanism: per move, insert a copy at the
new id, repoint every FK child (`measure_dimension_scope`, `measure_dimension_applicability`,
`input_dl_def_mappings`), delete the old row. Verified: 118→118, 0 orphans, all old ids gone.

| from_id | to_id | measure |
|---|---|---|
| 335 | **332** | Equipment Unplanned Downtime Count |
| 336 | **333** | Equipment Unplanned Downtime Duration |
| 1911 | **340** | Network Planned Downtime Count |
| 1912 | **341** | Network Planned Downtime Duration |
| 1913 | **342** | Network Unplanned Downtime Count |
| 1914 | **343** | Network Unplanned Downtime Duration |
| 340 | **360** | Solar Hours of Irradiance (H_irradiance) |
| 341 | **361** | Solar Average measured irradiance (G_measured) |
| 342 | **362** | Solar Standard Test Condition irradiance (G_STC) |
| 343 | **363** | Solar Electricity Generated Theoretical |

Resulting blocks: Equipment downtime 330–333 · Network downtime 340–343 · Solar 360–363.
Applied by `scripts/pass2-renumber-measures.ts`. Pre-change snapshots in `backup` schema
(`*_pre_renumber`).

**⚠ External p1→p2 map must be updated** — it references these `measure_id`s (see table below).
**Artifacts (JSON + workbooks) now due for regeneration** (were deferred to after this pass).

---

## 2026-07-23 · Pass 1d — Deactivate Equipment downtime **Count** measures (corrected)

Only the event-**Count** measures are not currently collected — Equipment downtime **Duration**
(hours) stays in use. Set the two Count measures inactive (kept in the catalogue, excluded from
shells/expected-inputs). Ids shown are post-Pass-2 (335→332, 336→333).

| measure_id | measure | field | from | to |
|---|---|---|---|---|
| 330 | Equipment Planned Downtime Count | is_active | true | **false** |
| 332 (was 335) | Equipment Unplanned Downtime Count | is_active | true | **false** |

**Correction (2026-07-23):** an earlier version of this pass over-applied the change and also
deactivated the two **Duration** measures (331, 333) — reverted; 331 and 333 are **active**.
Net effect: 2 measures inactive. Active measures: **116**.

Scope/applicability rows retained (measures still exist, just inactive). Network downtime
(340–343, was 1911–1914) **remains active** (confirmed — network downtime is in use).

---

## 2026-07-23 · Pass 1c — ESS unit consistency

The ESS operational triad (390 Electricity for Charging, 391 Energy Stored, 392 Electricity
Discharged) mixed units — 390 was kWh while 391/392 were MWh — which would break round-trip /
energy-balance comparisons. Aligned 390 to MWh.

| measure_id | field | from | to |
|---|---|---|---|
| 390 | unit_id | 103 (kWh) | **108 (MWh)** |
| 390 | variable_name | electricity_for_charging_kwh | electricity_for_charging_mwh |

---

## 2026-07-23 · Pass 1b — Rename fix-ups + Energy Storage broadening

Follow-ons to Pass 1. Ids still untouched.

**(1) Additional rename**

| measure_id | field | from | to |
|---|---|---|---|
| 303 | name | Non-Revenue Energy Consumed | **Non-Revenue Electricity Consumed** |
| 303 | variable_name | nonrevenue_energy_consumed_mwh | nonrevenue_electricity_consumed_mwh |

**(2) Downtime `variable_name` de-redundancy** — display names keep Count/Duration; the
`variable_name`s now use the unit word (events/hours) so there's no `count_events` / `duration_hours` tail:

| measure_id | variable_name from | to |
|---|---|---|
| 330 | equipment_planned_downtime_count_events | equipment_planned_downtime_events |
| 331 | equipment_planned_downtime_duration_hours | equipment_planned_downtime_hours |
| 335 | equipment_unplanned_downtime_count_events | equipment_unplanned_downtime_events |
| 336 | equipment_unplanned_downtime_duration_hours | equipment_unplanned_downtime_hours |
| 1911 | network_planned_downtime_count_events | network_planned_downtime_events |
| 1912 | network_planned_downtime_duration_hours | network_planned_downtime_hours |
| 1913 | network_unplanned_downtime_count_events | network_unplanned_downtime_events |
| 1914 | network_unplanned_downtime_duration_hours | network_unplanned_downtime_hours |

**(3) Equipment downtime → cover Energy Storage** — for 330/331/335/336:
- `measure_dimension_applicability`: added `resource_type = 985 (Energy Storage)` alongside
  `984 (Generator)` → now `resource_type ∈ {Generator, Energy Storage}`.
- `definition`: rewritten equipment-aware ("generation or storage unit"), replacing the
  generator-only wording. Scope unchanged (resource_type already by_context).

Applied by `scripts/pass1b-measure-fixes.ts`.

---

## 2026-07-23 · Pass 1 — Downtime measure renames

Generator → **Equipment** (measures broadened to cover storage as well as generation, per the
ESS decision), and metric wording standardised: **Events → Count**, **Hours → Duration**. Ids
unchanged (renumber is a later pass). `variable_name` regenerated via `deriveMeasureVariableName`
(slug + unit suffix). Unit ids unchanged (Events / Hours).

| measure_id | field | from | to |
|---|---|---|---|
| 330 | name | Generator Planned Downtime Events | **Equipment Planned Downtime Count** |
| 330 | variable_name | generator_planned_downtime_events | equipment_planned_downtime_count_events |
| 331 | name | Generator Planned Downtime Hours | **Equipment Planned Downtime Duration** |
| 331 | variable_name | generator_planned_downtime_hours | equipment_planned_downtime_duration_hours |
| 335 | name | Generator Unplanned Downtime Events | **Equipment Unplanned Downtime Count** |
| 335 | variable_name | generator_unplanned_downtime_events | equipment_unplanned_downtime_count_events |
| 336 | name | Generator Unplanned Downtime Hours | **Equipment Unplanned Downtime Duration** |
| 336 | variable_name | generator_unplanned_downtime_hours | equipment_unplanned_downtime_duration_hours |
| 1911 | name | Network Planned Downtime Events | **Network Planned Downtime Count** |
| 1911 | variable_name | network_planned_downtime_events | network_planned_downtime_count_events |
| 1912 | name | Network Planned Downtime Hours | **Network Planned Downtime Duration** |
| 1912 | variable_name | network_planned_downtime_hours | network_planned_downtime_duration_hours |
| 1913 | name | Network Unplanned Downtime Events | **Network Unplanned Downtime Count** |
| 1913 | variable_name | network_unplanned_downtime_events | network_unplanned_downtime_count_events |
| 1914 | name | Network Unplanned Downtime Hours | **Network Unplanned Downtime Duration** |
| 1914 | variable_name | network_unplanned_downtime_hours | network_unplanned_downtime_duration_hours |

Applied by `scripts/rename-downtime-measures.ts`.

### Open follow-ups triggered by this pass
- ✅ **Equipment applicability broadening** — done in Pass 1b (added Energy Storage 985).
- ✅ **`variable_name` redundancy** — resolved in Pass 1b (unit-word form).
- **Pass 2 — id renumber:** still to come (e.g. 340→360 Solar set); will update PK + FK children
  and the external p1→p2 map.
- **Artifacts:** enriched JSON + workbooks NOT yet regenerated — deferred to after Pass 2 per the
  agreed sequencing.
