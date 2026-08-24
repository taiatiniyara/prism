# Service-area capability declaration — per-period context for contextual shells

**Status: DRAFT for #8/#11 comment** · author #4 (schema) · initiated by Eugene 2026-08-25
**Related:** [unit-lifecycle-spec.md](unit-lifecycle-spec.md) (the pattern this mirrors),
[adr/0004-effective-dated-dimensions.md](adr/0004-effective-dated-dimensions.md),
[schema-redesign-medallion.md](schema-redesign-medallion.md) §3B (the context profile),
`lib/relevance/expected.ts` (the verifier that will enforce it).

## 1. The problem

Some measures are **contextual** — their shells should exist only where a context is
present. The clearest case is the **Transmission slice** of the network measures
(Network Length 420, Network Downtime 341/343, Distribution Transformers 410/411): it is
relevant only for a service area that **has a transmission network**.

Today "has a transmission network" is **inferred from the data** — an area has transmission
because it happens to carry Transmission-slice shells (the 4 grid areas: Ramu, Port Moresby,
Gazelle, Viti Levu). That is **circular** (the shell must exist to prove the context that
decides whether the shell should exist) and, critically, it **cannot handle change**: if a
new transmission network is commissioned — for an existing utility or a new one — there is
no channel for the utility to *tell* the system, so the generator can never produce the
right shells for it.

Context must be **declared, not inferred** — and per period, because networks emerge over
time (Eugene, 2026-08-25).

## 2. The pattern already exists for units — mirror it

Units already solve the identical problem. `units.period_entries` (jsonb) declares, **per
reporting period**, whether a unit is active and its capacity:

```json
"Satala GE 4": [
  { "report_period_id": 169, "is_active": false },
  { "report_period_id": 210, "is_active": true, "capacity_mw": 3 },
  { "report_period_id": 240, "is_active": true, "capacity_mw": 3 }
]
```

That is how a utility signals a **new technology or provider**: it registers a unit
(carrying `technology_id` + `provider_id`) and declares it active from the commissioning
period. The generator reads `period_entries` → knows the active technologies/providers that
period → produces the right generation shells. **This half is built and working.**

`service_areas` **already has the analog column — `report_periods` (jsonb) — but it is
empty (`[]`) for every area.** The infrastructure was designed in; it was never populated.
This spec is: **use it, the same way units use `period_entries`.**

## 3. The model

Per-period, per-service-area capability declaration on `service_areas.report_periods`:

```json
service_areas.report_periods = [
  { "report_period_id": 210, "has_transmission": true },
  { "report_period_id": 240, "has_transmission": true }
]
```

- **One entry per reporting period** the area is reported (mirrors `units.period_entries`).
- **Carry-forward read rule:** a period with no entry inherits the most recent prior
  entry's capabilities. So a capability is declared once when it changes and carries forward
  — no re-entry every period, but an explicit checkpoint every period (§4).
- **Extensible shape:** `has_transmission` is the first capability (the driver). The same
  entry can carry future per-period capabilities (network presence, seasonal operation,
  etc.). The existing static `provides_electricity/water/sanitation` booleans stay as-is for
  now; temporalise them here only if they turn out to change over time.

**Effective-dated by construction** (ADR 0004): the declaration is compared to the report
period's fiscal year, exactly like unit stints and measure `effective_from`.

## 4. Entry UX — "a flag to check each period" (Eugene)

Per-period **confirmation with carry-forward**, at submission time:
- The entry screen shows the area's **current** capabilities, carried forward from the last
  period.
- The utility **confirms or updates**: "New transmission network in this area? ✓" (and, via
  units, "New unit / IPP? ✓"). Only *changes* need touching — an explicit checkpoint, not
  full re-entry.
- A change is **stamped with the period** (effective from there); history stays accurate.

## 5. Generator + verifier integration

- **Shell generation:** the Transmission slice of a network measure is generated for a
  `(service_area, period)` **iff** that area's carried-forward declaration has
  `has_transmission = true`. Distribution slices stay universal (every area distributes).
- **Verifier (`lib/relevance/expected.ts`):** replace today's inferred signal with the
  declared one — a Transmission shell should exist **iff** the area declared transmission
  that period. This upgrades the current "already gated in the data" observation into an
  enforced invariant (and would flag a Transmission shell on a non-transmission area, or a
  declared-transmission area missing its Transmission shells).

## 6. Migration / backfill

The existing data already reflects the truth for FY2020–2025: the 4 grid areas carry
Transmission shells. Backfill their `report_periods` with `has_transmission = true` for the
periods they have Transmission shells (derive once from the current data — a legitimate
one-time seed, after which the declaration, not the shells, is authoritative). All other
areas default to `has_transmission = false` (no entry).

## 7. Ownership

- **#4 (schema):** the `service_areas.report_periods` capability contract + the generator/
  verifier gate (this spec).
- **#11 (entry UI):** the per-period confirm-or-update step (§4), carrying forward defaults.
- **#8 (grain / stint pattern owner):** confirm this mirrors the unit-stint model cleanly
  and fits the §3B context profile; own the carry-forward/effective-dating semantics
  alongside the unit stints.
- **#2 (migration):** the one-time backfill (§6) alongside the extract contract.

## 8. Open questions

- **Scope of capabilities:** just `has_transmission` now, or seed the fuller set
  (network presence, provider availability) so the profile is one place? Recommend start
  with `has_transmission`, keep the shape open.
- **Grain of declaration:** capability is per **service area**; a utility-wide capability
  (e.g. "has any transmission") is derivable as the OR across its areas — no separate store.
- **Static vs temporal for `provides_*`:** leave the existing booleans static unless
  evidence shows they change mid-life.
