# Unit lifecycle & temporal service-area spec (DRAFT)

_Status: DRAFT for grilling — 2026-08-02, session #2. Design of a temporal
(SCD-2) unit model with activation/deactivation dates, cross-service-area
reactivation, and prorated period membership. **No DDL until this is grilled by
Eugene and rule-checked by #8.**_

Owners / consulted: #2 (migration/schema, drafting) · #8 (grain convention —
assessment folded in) · #3 (calculator/proration) · #14 (reimport).

---

## 1. Motivation

Generation/storage units are added and retired over time, and a unit can be
**deactivated and later reactivated — including at a different service area**
(within the same utility). Each new reporting/submission period must capture only
the units relevant to that period, and KPIs must be **contextually accurate**
(prorated for units active only part of a period).

Today `units.service_area_id` is a fixed scalar. That is not just incomplete — it
is **latently wrong**: if a unit moves SA, a fixed column retroactively
misattributes the unit's entire history to its new SA. Making the unit temporal
fixes this.

## 2. Data model

### 2.1 `unit_activations` (stints) — new child table, source of truth

A stint is an **operating-state period**: a span of constant
`(service_area, power_station, rated_capacity_mw)`. **Any** state change — move,
derate, or both — closes the current stint and opens a new one; a **deactivation
is the gap between two stints**. Derate-and-return (deactivate → repair →
reactivate same grid at reduced rating) is therefore just two same-SA stints with
different capacity — no special case.

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `unit_id` | FK → `units` | the stable physical identity |
| `service_area_id` | FK → `service_areas`, NOT NULL | the SA for this stint |
| `power_station_id` | FK → `power_stations`, nullable | stint-scoped; if set, **must be a child of `service_area_id`** |
| `rated_capacity_mw` | numeric, nullable | **capacity as stint state** — supersedes per-period capacity; a derate = new stint |
| `activation_date` | `date` NOT NULL | BLO enters on add/reactivate |
| `deactivation_date` | `date` nullable | NULL = currently active; BLO sets on deactivate |
| `change_reason_id` | FK → managed_list, nullable | derate/impairment/move reason — audit only |

Constraints:
- `deactivation_date >= activation_date`.
- **≤ 1 open stint per unit** (partial unique index `WHERE deactivation_date IS NULL`).
- **Non-overlapping stints per unit** — Postgres GiST exclusion on
  `daterange(activation_date, deactivation_date, '[)')` — a physical unit cannot
  be in two places at once.
- **Stint-internal chain-consistency:** `power_station_id`'s SA = this stint's
  `service_area_id` (validate at stint create — the existing parentage rule, one
  level up).

### 2.2 `units` changes

- **Remove** `service_area_id` and `power_station_id` as authoritative columns —
  they move onto the stint.
- **Add** `current_service_area_id` (+ optionally `current_power_station_id`) as a
  **derived UI cache**, **maintained by a DB trigger** on `unit_activations` (chosen
  over a view for AI-search + read speed: a flat indexable column is a simple Power
  BI/AI dimension attribute and O(log n) to filter/join, whereas a view forces a
  join to the open stint on every read). **Never authoritative; never validated
  against.** (Same discipline as `grain_level`: derived, not dual-encoded. The
  trigger guarantees it never drifts — a *hand-synced* copy is the bug we avoid.)
  The column answers "now" only; **historical** "which SA in period P" resolves via
  `unit_activations` — indexed btree(`unit_id`) + GiST(`daterange`).
- **Keep** intrinsic attributes: `name`, `technology_id`, `provider_id`,
  `strata_id`, `utility_id` (within-utility moves only, so utility is intrinsic).
- **Drop** `unit_qty` (integer count) → replace with **`is_aggregate`** boolean
  (§2.4). **Drop** `is_virtual` (virtual units retired, §7).
- **Retire `units.period_entries` jsonb.** `{report_period_id, capacity_mw,
  is_active}` was proto-SCD-2 keyed to *reporting periods* instead of real dates —
  the stint model supersedes all three fields (capacity → stint state, is_active →
  stint overlap, period keying → real dates). Fold it into seed stints during the
  reimport and drop the blob. **One temporal mechanism, not two.**

### 2.3 Stint-boundary rule (prevents stint bloat)

Stint state = attributes that are **operationally period-variable AND
KPI-load-bearing**: `service_area`, `power_station`, `rated_capacity_mw`, and a
change/impairment reason (audit). Everything else stays **intrinsic** on `units`.
Consequently a **repower that changes `technology` is a NEW UNIT, not a new
stint** — this keeps the ratified derive-not-store taxonomy chain
(`technology → category → asset_class`) stable, since technology never varies
within a unit's identity.

### 2.4 Aggregate units (`is_aggregate` flag)

Some utilities lump several physical generators into one **aggregate unit** for
some grids — "All gens — grid" or, technology-specific, "All solar gens — grid".
An intrinsic **`is_aggregate` boolean** (on `units`) marks them; the exact
generator **count is not tracked** (Q6 — the count is a form-selector + context,
not KPI-load-bearing, so it fails the §2.3 stint-state test; and an aggregate stays
an aggregate, so the flag never flips). Consequences:
- **Drop `units.unit_qty`** (the integer count, currently 100% null) and **add
  `units.is_aggregate`** boolean, default false — intrinsic, stays on `units`, never
  stint state.
- `rated_capacity_mw` for an aggregate unit is the **lumped-group total** (stint
  state — a composition change is a capacity change → a new stint, as normal).
- At data entry, **`is_aggregate` presents a different form**: **downtime is entered
  in MWh (lost energy), not hours** — so the §4.1 energy-balance check for an
  aggregate unit consumes `downtime_MWh` directly (no hours→energy conversion).

## 3. Temporal grain & fact attribution (#8's rulebook)

### 3.1 Temporal chain-consistency

For a unit-anchored `data_entry`, the row's SA/station grain must match the stint
overlapping the **entry's period** — resolved by joining `unit_activations` on
period span, **never** `units.current_service_area_id`. This is essential because
PRISM enters data for **past** periods: a backdated entry for a since-moved unit
must anchor to the SA it had *then*.

### 3.2 One-grain-level invariant survives

The invariant was always "one grain **level** per measure per period," not "one
row per entity." A unit that splits across two SAs in a period yields two
**unit-level** rows — they are **partitions of the period, not copies** — so no
vertical double-counting: each SA gets its share, the utility sums both, nothing
counts twice.

### 3.3 Partition rule + same-SA merge / cross-SA split

`uniq_entry_address` has **no** stint dimension (and must not gain one — that would
leak implementation). Resolve the deactivate→reactivate collision by definition:

- **Same-SA stints within a period → MERGE** into one row — **for additive FLOW
  measures only** (MWh, hours; their sums are capacity-agnostic, so the address
  collision stays solved). Proration weight = total active days in that SA.
- **Cross-SA stints within a period → SPLIT** into distinct-address rows (one per
  SA), each weighted by its active days.
- Rows for the same `(unit, measure, period)` must belong to distinct stints whose
  spans **partition** the unit's active time that period; for additive measures the
  values must be that partition (loader/writer-checkable: parts sum to the whole
  where the whole is known).
- **Capacity never merges — it leaves the unit-grain fact table entirely.** Rated
  capacity is stint state (§2.1), read from `unit_activations`, not a
  `data_entries` row. Point-in-time capacity measures at unit grain are removed
  from the fact model.

## 4. Proration — per measure type (NOT blanket)

- **Additive / time-based** (MWh, hours, counts): prorate **in the stored fact** by
  `days(stint ∩ period) / days(period)`.
- **Capacity (point-in-time)**: not a fact at all — sourced from stint
  `rated_capacity_mw` (§2.1). Capacity-based KPI **denominators become
  `Σ(stint_capacity × stint_hours)`** across the period's overlapping stints. This
  is strictly more correct than today: a single capacity-per-period **cannot
  express a mid-period derate**, giving wrong capacity-factor denominators. Same
  spirit as "sum the additive inputs, then apply the formula" — the day×capacity
  weighting lives in the **KPI math** (#3), not the stored fact.
- `Hours in Period` (existing, `lib/period-hours.ts`) supplies the per-stint active
  hours that weight the denominator.

### 4.1 Entry granularity (Q3, resolved)

Generation, Downtime, and all **flow** measures are entered at
**`(unit, service_area, period)` — one number per unit-period**, never per stint;
the BLO/DAO entry workflow is unchanged. The stint profile does the work in
**computation**, not entry:
- **Capacity factor** = `period_generation ÷ Σ(stint_cap × stint_hours)`.
- **Energy-balance check** (per unit-period):
  `period_generation ≤ Σ(stint_cap × stint_hours) − downtime_energy`, with period
  downtime allocated across the period's stints **pro-rata by stint hours** so a
  mid-period derate stays unambiguous.
- **Consequence — the "Rated Capacity" measure retires:** it is no longer a
  `data_entry` fact; its values move to `unit_activations.rated_capacity_mw` (§7).

## 5. Period membership / shell generation

- A unit is relevant to a reporting period iff a stint's span overlaps the
  period's computed span (`report_date` + `report_type` → span; same derivation as
  Hours-in-Period). Relevance/shell generation switches from the manual
  `period_entries[].is_active` toggle to **stint-overlap membership**.
- **Dependency:** "period's computed span" needs the canonical period dimension
  (time-series spec). Sequence this work after / alongside it.

### 5.1 Published-KPI integrity (Q7, resolved) — stints stay live

Freezing does **not** happen at data-entry period approval and the stint model
needs **no per-period freeze/reopen machinery**. The **stint timeline stays live and
editable** (late-discovered derates flow into the next report refresh — the
benchmarking workflow *expects* amendments during the comment window). Published
integrity is instead owned by **Benchmarking Report snapshots**, fired automatically
at a version's **input cut-off** (1 s before midnight on a settable cut-off date),
*before* report generation:
- **Draft cut-off** → snapshot → notify BMO/DEV to generate the draft.
- **Final cut-off** (after the comment window) → snapshot → generate the Final.
- The immutable Final coexists with an **"Updated (Final)"** version drawing from
  **live** data, tracking every change since Final (transparency).

So each frozen version pins its source data + KPIs as-of its cut-off; post-Final
changes surface only in the live Updated view, never the frozen record. **This is a
separate greenfield feature**
(Benchmarking Report versioning + snapshots) that the stint model *feeds* but does
not own — see §8. Net effect here: `unit_activations` carries no approval-freeze
columns; it is purely the live operating-state timeline.

## 6. Stint authoring workflow (role-gated: BLO + DAOO)

**Authoring follows the data domain:** whoever enters generator data authors the
stints — so **BLO and DAOO (Operations)** both author unit stints (no toing/froing
between roles), with BMO/DEV override. DAOF/DAOH do **not** author unit stints.
(Parallel, for the deferred tariff effective-dating work: **BLO + DAOF** will own
tariff rate/structure changes.)

- **Add unit:** create `units` row (intrinsic attrs) + open first stint
  (`activation_date`, `service_area_id`, optional `power_station_id`,
  `rated_capacity_mw`).
- **Deactivate:** set `deactivation_date` on the open stint.
- **Derate / move:** close the open stint and open a new one (new capacity and/or
  SA) — the single mechanism for any operating-state change.
- **Reactivate:** open a **new** stint with a new `activation_date` — non-overlap
  enforced.
- Validation surfaced to the author: `deactivation_date >= activation_date`; no
  overlap; power_station ∈ chosen SA.

## 7. Migration / reimport contract (fresh purge + reimport)

Existing 501 units are **purged and reimported** (source data has grown), so no
in-place backfill.

- The loader (`retrieveUnits`, `app/migration/service.ts`) and the extract template
  (`scripts/gen-extract-template.ts`) are redefined to emit **stints**: each unit +
  one-or-more activation rows carrying `{service_area_id, power_station_id?,
  activation_date, deactivation_date?}`.
- **Real units** each get ≥1 seed stint (activation = `commissioned_date` or
  first-data date). The retired `period_entries` capacity history folds into seed
  stints: a run of periods at the same capacity → one stint; a capacity change in
  the history → a stint boundary (best-effort real dates from the period spans).
- **Retire the "Rated Capacity" measure:** its historical per-period values are the
  source for seed-stint `rated_capacity_mw`; after migration it is removed from the
  measure catalogue / relevance so capacity is never re-entered as a fact. (This is
  the concrete "capacity leaves the fact table" migration step.)
- **Virtual units (92)** — old-Prism per-grid grid-total placeholders
  (`is_virtual = true`, "Virtual GEN …", already excluded from every fact read).
  **Retired** in the reimport per the medallion framework (agreed) — grid totals
  come from gold rollups (All-row else sum of detail), not fake units. No stints.
- **Aggregate units are NOT virtual** and are **kept**: real units that lump
  several generators (`is_aggregate = true`, "All gens — grid" / "All solar gens —
  grid") used by 2 utilities for some grids. They take stints like any unit; their
  `rated_capacity_mw` is the lumped-group total; downtime is entered in **MWh, not
  hours** (form keys off `is_aggregate`). Set `is_aggregate` in the reimport. See §2.4.

## 8. Cross-stream impact

- **#8 (grain):** consulted — stints fit the convention with the §3 amendments;
  offered to rule-check this draft.
- **#3 (calculator):** owns §4 proration math + capacity KPI day-weighting.
- **#14 / migration:** owns §7 purge + reimport + loader/extract contract.
- **Refactor:** ~22–30 files read `units.service_area_id` — migrate to
  stint-resolved reads (period-aware) with `current_service_area_id` only for UI.
- **Benchmarking Report versioning + snapshots (§5.1):** a *separate greenfield
  feature* this spec depends on for published-KPI integrity, but does not own.
  Needs its own spec + ADR (report-version snapshot as the verifiability mechanism).
  Touches gold/medallion (#8) + a new reporting layer.
- **Coordinated DDL** (backup-first) once grilled + rule-checked.

## 9. Rollout / user-impact obligation

Per board rule 6, landing this change requires a **`docs/USER-IMPACT.md` ledger row
in the same commit** (already seeded as **row 7**, status 🕐). Keep it current as
the spec settles. The journey deltas this change owes instructions for:
- **BLO** — workflow shifts from *"confirm the unit roster each report period"* to
  *"keep the unit activation timeline current"* (add / deactivate / derate / move
  are dated events, entered once).
- **DAO / analysts** — capacity-based KPIs (Capacity Factor, etc.) now use
  `Σ(stint_capacity × stint_hours)`; a mid-period derate changes denominators vs
  the old single-capacity-per-period behaviour.

## 10. Open items

Resolved so far: Q1 replace (§Context) · Q2 units-only-but-replicable · Q3
per-period entry (§4.1) · Q4 BLO+DAOO authoring (§6) · Q5 retire virtual units,
keep aggregate units (§7/§2.4) · Q6 drop `unit_qty` → `is_aggregate` flag (§2.4) ·
Q7 freeze at report-version snapshot, stints stay live (§5.1) · capacity leaves
fact table + `period_entries` retired (Eugene-agreed).

Still open:
- [ ] **#3 buy-in:** capacity KPI denominators → `Σ(stint_capacity × stint_hours)`
      (§4); MWh-downtime aggregate-unit path.
- [ ] #8 rule-check of this draft against the hierarchy rulebook.
- [ ] Sequencing vs the canonical period dimension (§5 dependency).

All unit-spec design questions resolved. `current_service_area_id` = **trigger-
maintained** (§2.2, chosen for AI-search + speed). Remaining before build: #8
rule-check + #3 calculator buy-in.

Spawned / adjacent (separate specs):
- [ ] **Benchmarking Report versioning + snapshots** (§5.1/§8) — greenfield; this
      spec depends on it for published-KPI integrity.
- [ ] ADR: "effective-dated dimensions" (Q2) · ADR: "report-version snapshot as the
      KPI verifiability mechanism" (Q7).
