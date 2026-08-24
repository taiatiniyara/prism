# Service-area capability declaration — per-period context for contextual shells

**Status: RATIFIED-BY-DIRECTION 2026-08-25** (Eugene approved the spans approach AS FINAL, in
#8's session; #8 endorses §3/§6; #11 aligned on §4 placement) · author #4 (schema) ·
initiated by Eugene 2026-08-25 · **revised 2026-08-25 per #8: span model, not jsonb**
**Related:** [unit-lifecycle-spec.md](unit-lifecycle-spec.md) (the ratified stint model this
mirrors), [adr/0004-effective-dated-dimensions.md](adr/0004-effective-dated-dimensions.md),
[schema-redesign-medallion.md](schema-redesign-medallion.md) §3B (the context profile),
`lib/relevance/expected.ts` (the verifier that will enforce it).

## 1. The problem

Some measures are **contextual** — their shells should exist only where a context is
present. The clearest case is the **Transmission slice** of the network measures
(Network Length 420, Network Downtime 341/343, Distribution Transformers 410/411): it is
relevant only for a service area that **has a transmission network**.

Today "has a transmission network" is **inferred from the data** — an area has transmission
because it happens to carry Transmission-slice shells (the 4 grid areas: Ramu, Port Moresby,
Gazelle, Viti Levu). That is **circular** with a fatal bootstrap failure on exactly Eugene's
scenario: the shell must pre-exist for the data to prove the context that justifies the
shell, so a **newly commissioned** network — for an existing utility or a brand-new one —
can never bootstrap its shells. Context must be **declared, not inferred** — and temporal,
because networks emerge over time (Eugene, 2026-08-25).

## 2. Mirror the RATIFIED unit model — spans, not the legacy jsonb

Units solve the identical problem, and the **ratified** answer is
[`unit_activations`](unit-lifecycle-spec.md) **stints**: a relational SCD-2 table of
`activation_date` / `deactivation_date` intervals carrying the operating state, with ≤1 open
stint and GiST non-overlap per unit. A utility signals a **new technology or provider** by
registering a unit (`technology_id` + `provider_id`) and **opening a stint** from its
commissioning date.

> **Correction (per #8, 2026-08-25):** `units.period_entries` jsonb — which an earlier draft
> of this spec proposed mirroring — is **explicitly being RETIRED** by the unit-lifecycle
> spec (§2.2: proto-SCD-2 keyed to *reporting periods* instead of real dates; folded into
> seed stints; "one temporal mechanism, not two"). It runs today only because the stint DDL
> is gated on the reimport. **`service_areas.report_periods` jsonb is the same legacy shape**
> and retires with it. Mirroring it would build a second instance of a disease already
> scheduled for cure, plus fresh `report_period_id` coupling the period-dim rework must then
> unwind. So this spec mirrors the **stint/span model**, and `service_areas.report_periods`
> stays empty and retires alongside `units.period_entries`.

## 3. The model — a capability-span table

```
service_area_capabilities (
  id             serial pk,
  service_area_id integer not null → service_areas(id),
  capability     text      not null,   -- controlled vocab; CHECK lists members (§3)
  effective_from date      not null,   -- BLO sets when the capability begins
  effective_to   date      null        -- null = currently in effect
)
-- capability vocabulary is a CHECK, updated as members are added (grain_level treatment):
--   CHECK (capability IN ('has_transmission'))            -- one member today
-- so a typo'd capability can't silently gate nothing (per #8, 2026-08-25).
```

Mirrors `unit_activations` exactly:
- **≤ 1 open span per (service_area, capability)** — partial unique index
  `WHERE effective_to IS NULL`.
- **Non-overlapping spans per (service_area, capability)** — GiST exclusion on
  `daterange(effective_from, effective_to, '[)')`.
- **`effective_to >= effective_from`** check.
- **Carry-forward is not a rule — it's the shape.** An open span *is* carried forward; a
  capability is declared once, at the span boundary. (The jsonb needed a read-rule precisely
  because it was the wrong shape.)
- **Effective-dated by construction, genuinely** (ADR 0004): "in effect for a period" is the
  span overlapping the report period's **fiscal year** — the *same* fiscal-year comparison
  the verifier already codes for measure `effective_from`. No new comparison logic.
- **Provenance columns** (for §4 rule 3): the table carries `created_by`/`created_at` (append)
  and, on amend, `change_reason` + `changed_by`/`changed_at` — the `change_reason` analog #8's
  amend-provenance rule requires. Same shape and audit discipline as the unit-stint table (one
  family); if stints resolve provenance via a shared history/audit table instead of inline
  columns, capability spans use the identical mechanism.
- **Extensible:** `capability` is a controlled vocabulary; `has_transmission` is the first
  member (the driver). Future per-area temporal capabilities (network presence, seasonal
  operation) are new `capability` values, no schema change. The static
  `provides_electricity/water/sanitation` booleans stay as-is unless they prove to change
  mid-life, in which case they become capability spans too.

## 4. Entry UX — "a flag to check each period" (Eugene)

Storage shape and workflow are decoupled — the per-period checkpoint is a UX affordance that
writes **span operations**. The key sequencing point (raised by #11, 2026-08-25): because
capabilities **drive which contextual shells exist**, the declaration must resolve **before
entry, not at submission**. The span model makes that automatic for the common case, because
the carried-forward open span already *is* the declaration — no user action is needed for a
period where nothing changed. So the period lifecycle is:

1. **Period opens (or is first opened).** The shell set is generated from the area's
   **currently-open** capability spans (carry-forward). A period with no change needs zero
   capability input — the correct contextual shells are already there.
2. **Utility declares a change during entry** (rare): "New transmission network in this
   area? ✓" (and, via units, "New unit / IPP? ✓"). This writes a span op — **confirm =
   no-op** (open span carries forward); **change = close the open span + open a new one**,
   stamped with the change date — and **triggers an incremental shell re-gen** for the
   affected contextual measures (§5). Re-gen is **additive-safe**: it creates the newly
   relevant shells and never destroys anything already entered.
3. **Submission re-confirm** (lightweight safety net): the capabilities that shaped this
   period's shells are shown for a final "still correct? ✓". A late change here re-runs the
   incremental re-gen exactly as in step 2 before the period closes.

Placement is therefore **period-start / first-open** for the gate, with a **submit-time
re-confirm** — not submission-only. Only changes touch storage; history stays accurate; no
re-entry every period.

**Two kinds of "change" the span model distinguishes** (raised by #11, 2026-08-25 — a real
semantic split, not one affordance): the model separates them structurally, so the UI can
surface them as two intents rather than conflating them.
- **New commissioning** — a network genuinely came online *this* period → **append**: open a
  new span with `effective_from` = this period's fiscal-year start. History is untouched; the
  prior state remains true for prior periods.
- **Correction of a past mis-declaration** — last period's capability was recorded wrong (said
  "no transmission" when there was, or with the wrong start date) → **amend**: adjust the
  existing span's boundary (move `effective_from`, or reopen a wrongly-closed span). No new
  span; the timeline is fixed, not forked.
This distinction is **owned by #8** (capability-span semantics) alongside the identical
append-vs-amend split for unit stints; #11 renders it as a two-option affordance
("a new network came online" vs "correct a past entry"), no span mechanics surfaced.

**The three amend-consequence rules** (ruled by #8, 2026-08-25 — shared temporal-semantics
family, written once here and cited by the unit-stint timeline; append needs none of this,
amend needs all three because it rewrites what the system believed):
1. **Amend reflows its consequences.** Moving a boundary regenerates the shells for every
   period now inside/outside the capability window and **recomputes those periods' scorecard
   denominators**. An amendment that doesn't reflow is worse than the mis-declaration it fixes.
2. **Snapshots pin; live absorbs** (the §5.1 stint-edit pattern). The amendment flows into
   live views and the next report refresh; a **frozen report version never changes** — the
   amendment surfaces only in the "Updated (Final)" delta view. Published benchmarks are never
   retroactively rewritten.
3. **Amend carries provenance** — who / when / why (a `change_reason` analog) — because it
   rewrites declared history that past scorecards consumed. Same authors as append (BLO/DAOO
   per the stint authoring rule): **audited, not escalated.** Append needs no ceremony.

## 5. Generator + verifier integration

- **Shell generation:** the Transmission slice of a network measure is generated for a
  `(service_area, period)` **iff** an open/covering `has_transmission` span overlaps that
  period's fiscal year. Distribution slices stay universal.
- **Verifier (`lib/relevance/expected.ts`):** replace today's inferred signal with the
  declared span — a Transmission shell should exist **iff** the area has a `has_transmission`
  span covering that period. Upgrades today's "already gated in the data" observation into an
  enforced invariant (flags a Transmission shell on a non-transmission area, or a
  declared-transmission area missing its Transmission shells).

## 6. Migration / backfill — seed spans (like seed stints)

The current data reflects the truth for FY2020–2025: the 4 grid areas carry Transmission
shells. **Seed one `has_transmission` span per grid area**, `effective_from` = its first
Transmission-shell period's fiscal-year start, `effective_to` = NULL (open). A legitimate
one-time derivation from the current data, after which the **span, not the shells,** is
authoritative. All other areas have no span (= no transmission). This is the direct analog
of the unit "seed stint" fold-in (unit-lifecycle-spec §7) and should ride the same reimport.

## 7. Ownership

- **#4 (schema):** the `service_area_capabilities` table + the generator/verifier gate.
- **#11 (entry UI):** the confirm-or-update checkpoint (§4) that writes span operations.
- **#8 (grain / stint pattern owner):** owns the capability-span semantics alongside unit
  stints — one rulebook family (span = state period; explicit close; non-overlap;
  fiscal-year comparison; declaration stamped at change; append-vs-amend §4). Endorsed
  2026-08-25. **When the stint DDL + this table land in the coordinated package, #4 pings #8
  for a single semantics-verification pass over spans + stints together** (one family, one
  review).
- **#2 (migration):** the seed-span backfill (§6), folded into the reimport alongside seed
  stints.

## 8. Open questions

- **Capability vocabulary:** just `has_transmission` now, or seed a fuller set? Recommend
  start with `has_transmission`, keep `capability` open.
- **Shared DDL timing:** the GiST exclusion needs the `btree_gist` extension (same
  dependency as `unit_activations`); land both in the same coordinated DDL so there's one
  temporal-spans migration, not two.
- **Utility-wide capability** (e.g. "has any transmission") is the OR across the utility's
  area spans — derived, not separately stored.
