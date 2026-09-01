# ADR 0004 — Effective-dated dimensions (temporal validity for config/reference entities)

- Status: **Accepted** (initiated by Eugene 2026-08-03; units-stints instance ratified 2026-08-03 by #8/#3 + Eugene; measures instance confirmed by Eugene 2026-08-03) · **Amended 2026-08-25 — a coarse measure-level `measure_definitions.effective_from` was ADDED as the "does this measure exist this period" gate, complementing (not replacing) the member-level applicability windows. See the Amendment at the foot of this ADR.**
- Date: 2026-08-03
- Related: [docs/unit-lifecycle-spec.md](../unit-lifecycle-spec.md) (1st instance — SCD-2 stints), [docs/measure-effective-dating-spec.md](../measure-effective-dating-spec.md) (2nd instance — applicability windows), [docs/benchmarking-report-versioning-spec.md](../benchmarking-report-versioning-spec.md) (snapshots freeze the effective config), [docs/WORKSTREAMS.md](../WORKSTREAMS.md)

## Context

Several PRISM config/reference entities carry state that **changes at real points in
time**, where a global on/off flag silently corrupts history:

- **Units** — a generating unit is added, deactivated, reactivated (possibly at a
  different service area), and derated; a fixed `is_active` + fixed `service_area`
  retroactively misattributes its whole history.
- **Measure expectations** — a new data expectation ("Planned Downtime for Battery
  Storage", 4 solar measures) must apply **from FY2026**, not retroactively to
  FY2024/2025; a global `is_active` cannot express "from period X".
- **Tariffs / transmission** (deferred) — service-area-scoped and time-varying, with
  the same mid-period-change limitation.

The common failure of the naive approach (a boolean, or an unversioned attribute)
is that it applies to **all** periods, past and future — so turning something on
today rewrites what was expected/true yesterday.

## Decision

Adopt **effective-dated validity windows** as the standard pattern for temporal
config/reference state, applied **per-instance and bespoke — not one generic
mechanism** (per the units grill Q2: "units-only-now-but-replicable").

1. **Each instance gets its own effective-dated shape**, mirroring a shared idea:
   - **Units:** a `unit_activations` **stint** table — `activation_date` /
     `deactivation_date` intervals carrying the operating state (service_area,
     power_station, rated_capacity), **non-overlapping** (mutual exclusivity
     matters).
   - **Measures:** `effective_from` / `effective_to` on
     `measure_dimension_applicability` — simple validity windows (overlap/exclusivity
     not required). **(Amended 2026-08-25 — a second, coarser gate was added at the
     measure level: `measure_definitions.effective_from`. See the Amendment below.)**
   - **Future (tariff/transmission):** the same window shape when built.

2. **No single generic "effective-dated table."** A shared abstraction now would be
   premature and leaky (the instances differ — stints need non-overlap + carried
   state; applicability needs only a window). Consistency comes from the *shape*
   (dated bounds, nullable = open, compared against the period dimension), not a
   shared table.

3. **Compared against the period dimension, fiscal-year-aware.** "In effect for a
   period" is resolved by comparing the window to the report_period's **fiscal
   year** (per Eugene: `effective_from` in 2026 = FY2026 for FY-spanning utilities),
   reusing the canonical period-span logic (shared with Hours-in-Period, stint
   overlap, shell generation).

4. **Derived, never dual-encoded.** Any convenience "current" projection (e.g.
   `units.current_service_area_id`) is trigger/view-maintained from the window,
   never hand-synced or authoritative.

5. **Frozen by report snapshots.** The effective config in force at a Benchmarking
   Report cut-off is captured in that report's snapshot, so a frozen report reflects
   the units/measures/expectations effective **as of then** — history is never
   rewritten by a later window edit.

## Consequences

- **Consistency across instances** — anyone reading `unit_activations` and later
  `measure_dimension_applicability.effective_from` sees the same idea, so a future
  tariff/transmission version mirrors it instead of reinventing.
- **Shell / relevance / rollup logic filters by period-overlap** rather than a
  boolean — the single integration change per consumer.
- **History integrity** — turning something on/off for future periods never corrupts
  past submissions; report snapshots pin the rest.
- **Deliberate non-abstraction** — the trade-off accepted is *N bespoke-but-similar
  windows* over *one generic mechanism*; chosen for clarity and because the
  instances genuinely differ. Revisit only if the instances converge.
- **Cross-stream:** #8 (grain — stint SA over time), #3 (calculator — capacity-hours
  over stints), #10 (registration — primary-contact + measure-change notification),
  report-versioning (#2) for the snapshot freeze.

## Amendment (2026-08-25) — measure-level `effective_from` added

**What changed.** A `date` column `measure_definitions.effective_from` was added and
shipped (`4eaac1e`; migration `scripts/sql/2026-08-25-measure-effective-from.sql`). The
original decision placed measure effective-dating **only** on
`measure_dimension_applicability` (member-level windows). Shipped schema now also carries
a **measure-level** date. This amendment records that reversal in place so a future
reader finds it here, not only in the spec.

**Why the member-level windows were insufficient.** The applicability windows date a
*specific `(dimension, member)` slice*. But two things forced a coarser gate:

1. **Measures with no applicability rows can't be dated at all.** By the sparse
   convention, *no rows for a `(measure, dimension)` = all members valid* — so a measure
   with zero applicability rows has nowhere to hang a date. The live case was **302
   (Electricity Sold to Customers)**: 0 applicability rows, yet it needed a definite
   effective date. Member-grain dating literally cannot express it.
2. **The BMO catalogue is authored at the measure level** — one "birth date" per measure
   (119 rows), not per slice. Pushing a measure-level fact down onto every member row is
   lossy and fragile.

**The resolved two-level model (both gates checked by the generator):**

| Gate | Column | Question | Grain |
|---|---|---|---|
| Existence (coarse) | `measure_definitions.effective_from` | Does this measure **exist** this period? | measure |
| Validity (fine) | `measure_dimension_applicability.effective_from` / `effective_to` | Is this **slice** valid this period? | measure × dimension × member |

Both compare against the report period's **fiscal year** (Decision point 3 unchanged).
This mirrors the layering already accepted elsewhere — measure-default + per-slice
override obligation (data-availability §3.1.1), and unit birth/activation dates
(`unit_activations`). The catalogue is now consistently temporal at both grains.

**Unchanged:** everything else in this ADR stands — per-instance bespoke shapes, no
generic table, fiscal-year comparison, snapshot freeze. This is an *addition* of a
coarser companion gate, not a change to the member-level design.
