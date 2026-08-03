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
| `rated_capacity_mw` | numeric, **NOT NULL** for generation/storage stints | **capacity as stint state** — supersedes per-period capacity; a derate = new stint. (F1) A genuinely-unknown capacity must **not** be a silent NULL→0 in `Σ(cap×hours)` — it **excludes** that unit-period from capacity KPIs **and flags it** (silent 0 deflates denominators → inflated capacity factors). |
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
an aggregate, so the flag never flips).

**(B1 resolution — single-technology only.)** Aggregate units are **restricted to a
single technology**, so `technology_id` is always a **real leaf** and the derive-not-
store taxonomy chain holds (no All-member on a unit row). This is confirmed by the
data: every existing aggregate is single-technology — Tonga Power's "All Diesel /
All Solar / All Wind Generation (&lt;grid&gt;)" and Pitcairn's "Solar combined". A mixed
"All gens" does not exist in practice; if one were ever needed it must be **split
into per-technology aggregates at reimport**, never modelled with an All-member leaf.

Consequences:
- **Drop `units.unit_qty`** (the integer count, currently 100% null) and **add
  `units.is_aggregate`** boolean, default false — intrinsic, stays on `units`, never
  stint state.
- `rated_capacity_mw` for an aggregate unit is the **lumped-group total** (stint
  state — a composition change is a capacity change → a new stint, as normal).
- At data entry, an aggregate unit records downtime **in MWh (lost energy), not
  hours**. **(B2 fix)** This is a **separate measure** `downtime_energy_mwh`
  (relevance-gated to `is_aggregate` units) — **never** the hours-based `Downtime`
  measure with two UoMs, which would make any silver/gold "downtime" sum mix hours
  and MWh. The §4.1 balance check consumes `downtime_energy_mwh` directly.

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
- **Cross-SA stints within a period → SPLIT** into distinct `(unit, SA, period)`
  addresses. For **entered** data each address carries its own **entered actual**
  (the BLO/DAOO knows the per-SA figures) — **not** a calendar split of one number
  (B3). Active-day weighting applies only to **reimport** allocation where the
  historical per-SA split is unknown.
- Rows for the same `(unit, measure, period)` must belong to distinct stints whose
  spans **partition** the unit's active time that period; for additive measures the
  values must be that partition (loader/writer-checkable: parts sum to the whole
  where the whole is known).
- **Capacity never merges — it leaves the unit-grain fact table entirely.** Rated
  capacity is stint state (§2.1), read from `unit_activations`, not a
  `data_entries` row. Point-in-time capacity measures at unit grain are removed
  from the fact model.

## 4. Proration — per measure type (NOT blanket)

- **Additive / time-based** (MWh, hours, counts): **entered actuals are sacrosanct —
  never calendar-prorated** (B3 fix). A unit can generate 0 MWh in stint 1 and
  everything in stint 2; `days(stint∩period)` ≠ reality. Entry is per
  `(unit, service_area, period)` (§4.1), so a mid-period **SA move yields two
  entered rows** (one per SA address), not one figure split by calendar. Day-ratio
  proration is used in **exactly two places**: (i) **reimport** allocation where
  per-SA historical actuals are unknown; (ii) **downtime** allocation across stints
  for the §4.1 balance check.
- **Capacity (point-in-time)**: not a fact at all — sourced from stint
  `rated_capacity_mw` (§2.1). Capacity-based KPI **denominators become
  `Σ(stint_capacity × stint_hours)`** across the period's overlapping stints. This
  is strictly more correct than today: a single capacity-per-period **cannot
  express a mid-period derate**, giving wrong capacity-factor denominators. Same
  spirit as "sum the additive inputs, then apply the formula" — capacity-hours is a
  **silver-derived measure** (§4.2) the calculator consumes as an additive input, not
  a stored fact and not engine-side stint math.
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

### 4.2 Where `Σ(cap×hours)` is computed (resolved with #3)

`Σ(stint_capacity × stint_hours)` per `(unit, period)` is materialized as a
**silver-derived measure** — computed in the silver/data layer from
`unit_activations`, *not* entered. The calculator consumes it as an **ordinary
additive input**, divides, and rolls up by summing — the engine stays **stint-
unaware** (no lifecycle-table coupling). Ownership line: **stint→capacity-hours math
= silver / #8-data-layer; calculator = division + rollup.** #3 confirmed this is
consistent with the calculator-engine spec (§4.6, ratio-of-sums; capacity-hours is
additive so it rolls up unit→utility correctly). The **energy-balance check (§4.1)**
is a data-quality validation → **loader/gold validation layer**, not the formula
evaluator. The Rated-Capacity retirement is picked up in #3's **manual KPI rebuild**
checklist (capacity KPIs re-bind to the new capacity-hours input).

**Ownership (precise, per #8):** **#8 owns the semantics + spec** of the
capacity-hours derivation (which stints count, span-intersection math, proration
weights, NULL handling) and verifies the implementation; **#2 builds the physical
silver object** (same split as the chain-consistency writer). "Silver/#8-data-layer"
is shorthand, not #8 writing the SQL. #8 confirmed this is a deterministic
**derivation** (like sub_region-via-FK / grain_level), not formula evaluation — so
the one-evaluator rule holds. **Four conditions (#8):**
1. **Never in `data_entries`** — capacity-hours is silver/gold-materialized only;
   registrable as a system/calculated measure for bindings, but no fact-table rows
   (capacity left the fact table; its derivative doesn't sneak back).
2. **NULL-capacity = F1**, load-bearing — a NULL stint capacity excludes the
   unit-period + flags it; never a silent 0. Resolve F1 before this measure ships.
3. **Period spans from the canonical period dim** (§5 dependency) — now on this
   measure's critical path.
4. **Snapshot this measure too** — under §5.1 live-stints a late edit changes
   historical capacity-hours (by design); the report-version snapshot must capture
   the capacity-hours measure, as it is an input to frozen KPIs (see §5.1/§8).

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

**Snapshot scope (condition 4):** a report-version snapshot must capture the
**silver-derived capacity-hours measure** too (§4.2), since it is an input to frozen
KPIs and live-stint edits change it.

**Terminology reconcile with calculator §4.5 (F3):** "approved" and "published" are
**two different things** — *approved-gold* (the calculator's surface that refreshes
on entry Approval = current approved data) vs the *frozen report-version snapshot*
(the immutable published record). They coexist; the spec must not conflate them.
**Interim (F3):** report-version snapshots are greenfield, so **until they ship there
is no frozen record** — a live-stint edit mutates approved-gold KPI history in place.
That gap is acceptable pre-snapshots but must be stated, and the snapshot feature is
the thing that closes it.

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
- **(F5) Repoint KPI formulas** that reference the "Rated Capacity" measure to the
  stint-sourced capacity-hours input at the **manual KPI rebuild** — explicit so
  #3's rebuild checklist catches every capacity KPI.
- **(F5) DDL note:** the `unit_activations` GiST exclusion constraint needs the
  **`btree_gist`** extension (for `unit_id` equality alongside the `daterange`
  overlap).
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
- **#3 (calculator):** ✅ green-lit (§4/§4.1 consistent w/ calculator-engine spec
  §4.6). Per §4.2, the calculator consumes a **silver-derived** capacity-hours input
  (stays stint-unaware); **#8/data-layer owns** materializing `Σ(cap×hours)`;
  energy-balance check → loader/gold validation. Capacity KPIs re-bind in #3's manual
  rebuild.
- **#14 / migration:** owns §7 purge + reimport + loader/extract contract.
- **Refactor:** ~22–30 files read `units.service_area_id` — migrate to
  stint-resolved reads (period-aware) with `current_service_area_id` only for UI.
- **Benchmarking Report versioning + snapshots (§5.1):** a *separate greenfield
  feature* this spec depends on for published-KPI integrity, but does not own.
  Needs its own spec + ADR (report-version snapshot as the verifiability mechanism).
  Touches gold/medallion (#8) + a new reporting layer.
- **#12 (security/RLS) (F4):** `unit_activations` is a new table → needs an RLS
  policy; tenant is derivable via `unit → utility`. Flag to #12.
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

Reviews:
- [x] **#3 (calculator):** ✅ green-lit; §4.2 accepted (silver-derived
      capacity-hours; engine stays stint-unaware).
- [~] **#8 (grain rule-check):** core PASS verbatim (§2.1–2.3/§3/§5/§7/§9); §4.2
      accepted with ownership precision + 4 conditions (folded into §4.2/§5.1). Clear
      fixes absorbed: **B2** (downtime → separate `downtime_energy_mwh`, §2.4),
      **B3** (entered actuals never calendar-prorated, §3.3/§4), **F1** (NULL
      capacity excludes+flags, §2.1), **F3** (approved≠published + interim, §5.1),
      **F4** (#12 RLS, §8), **F5** (formula-repoint + btree_gist, §7). #8 endorses
      once B1 resolved.

**Needs Eugene (2 quick confirms before ratification):**
- [~] **B1 — mixed-technology aggregates → RESOLVED by data (confirm).** All existing
      aggregates are single-technology (Tonga Power All-Diesel/Solar/Wind, Pitcairn
      Solar-combined); no mixed "All gens" exists. Resolution: **restrict aggregates
      to single-technology** (real leaf, taxonomy holds, zero cost) — §2.4. Eugene
      confirms.
- [ ] **F2 — drop vestigial `units.strata_id` (recommend YES).** #8: it only marked
      virtual units' pretend levels; post-retirement every real unit is level-1, so
      it's dead weight — drop in the same DDL. (Parallel `service_areas.strata_id`
      noted for #2, out of scope here.)

Design questions Q1–Q7 + current_sa all resolved.

Spawned / adjacent (separate specs):
- [ ] **Benchmarking Report versioning + snapshots** (§5.1/§8) — greenfield; this
      spec depends on it for published-KPI integrity.
- [ ] ADR: "effective-dated dimensions" (Q2) · ADR: "report-version snapshot as the
      KPI verifiability mechanism" (Q7).
