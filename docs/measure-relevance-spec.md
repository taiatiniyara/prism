# Measure relevance — one standardised surface (declared + stint-derived)

**Status: RATIFIED-BY-DIRECTION 2026-08-26** (Eugene + #8 aligned, B-clean; cluster of 4 follow-on
rulings by #8 2026-08-26 folded in — polarity, generator-scope, transmission-keying, relevance-mode).
Author #4 (schema).
**Supersedes:** [service-area-capability-spec.md](service-area-capability-spec.md) (the span model —
its storage shape is replaced; its case law transfers here).
**Related:** [unit-lifecycle-spec.md](unit-lifecycle-spec.md) (stints — the sole truth for
generation), [adr/0004-effective-dated-dimensions.md](adr/0004-effective-dated-dimensions.md),
`lib/relevance/expected.ts` (the verifier that will enforce the invariants).

## 1. The problem — three relevance mechanisms, one job

"Which shells does a utility owe for a period?" is answered today by **three** different
mechanisms, none of them the same shape:

| mechanism | storage | shape | status |
|---|---|---|---|
| Transmission | `transmission_relevance` | period × area × measure, `is_relevant` | 0 rows; **default-ON/suppress** (backwards for a rare capability) |
| Tariff | `tariff_relevance` | period × area × measure × payment_mode × customer_type | 179 rows (139 false / 40 true) — **default-ON in practice** |
| Generation | `units.period_entries` jsonb `is_active` | per-unit, per-period | all 535 units; **being retired** by the stint model |

Three mechanisms → three code paths, three UIs, and (for transmission) a polarity that made it
useless. The fix is **one uniform relevance surface** the shell generator reads, with the rows
produced two ways — *declared* by the utility, or *derived* by the engine from stints.

The **bootstrap principle is retained** (from the superseded span spec): relevance is
**declared, not inferred from the presence of shells** — a newly-commissioned network or a new
generation source becomes relevant by a declaration/derivation, never by the circular "a shell
exists therefore the context exists." Only the storage shape changes, not this principle.

## 2. What is even in scope — `relevance_mode` (per measure)

Only **conditional-existence** measures belong in the surface. The other ~114 measures (Revenue,
Customers, FTE, …) are **unconditionally** relevant at their grain — seeding always-true rows for
them would be dense noise that makes *absence* ambiguous again. A single per-measure field on
`measure_definitions` classifies every measure (grain_level treatment — `text` + CHECK, NOT NULL,
explicit at measure creation):

```
relevance_mode ∈ { 'unconditional', 'conditional_default_on', 'conditional_default_off' }
```

- **`unconditional`** — always shelled at its grain; **no `measure_relevance` rows**. The generator
  shells it from grain × scope-expansion directly. (~114 measures, incl. the 13 utility_function
  measures — see §5 for why their *transmission slice* is still gated.)
- **`conditional_default_off`** — relevant only where declared/derived; absence = not relevant.
  **generation + transmission.**
- **`conditional_default_on`** — relevant everywhere *except* where a suppress row says otherwise;
  absence = relevant. **tariff** (its real polarity: 139 suppress rows today).

This single field encodes Eugene's per-family polarity ruling exactly as two of the three values
(a two-field `is_conditional` + `default_relevant` shape would allow nonsense states —
`unconditional` has no meaningful default; the enum can't express the nonsense). The generator
reads `measure_relevance` **only** for the two conditional modes; unconditional measures never
touch it.

### 2.1 Measure-level mode vs member-level gate — the distinguishing rule (#8, 2026-08-26)

`relevance_mode` is a **measure-level** field, but conditionality is sometimes a property of a
single dimension *member*. The rule that decides which applies — and prevents the
distribution-suppression bug #8 caught:

> **Uniform conditional treatment across the measure's expansion → measure-level mode.
> A mix of always-relevant members and gated members → member-level gate (measure stays
> `unconditional`).**

- **Generation** (`conditional_default_off`, measure-level): *all* provider×technology slices are
  uniformly stint-gated — no always-relevant slice. Uniform → measure-level.
- **Tariff** (`conditional_default_on`, measure-level): *all* customer_type×payment_mode cells follow
  the same default-on/suppress rule — no always-relevant-vs-gated split. Uniform → measure-level.
  Safe **because it is default-ON** (includes by default): it has no analog of the
  distribution-suppression bug, which is specific to default-OFF wrongly hiding an always-relevant
  member.
- **Transmission** (member-level gate; hosts stay `unconditional`): the 13 host measures **mix** an
  always-relevant Distribution member with a gated Transmission member. A measure-level
  `conditional_default_off` would suppress Distribution — so transmission alone is member-level (§5).

So the asymmetry is principled, not incidental: transmission is member-level **only** because its
hosts carry a mixed member set; generation and tariff are uniform, so they stay measure-level.

## 3. The surface — `measure_relevance`

```
measure_relevance (
  id                uuid pk,
  report_period_id  integer not null → report_periods,
  service_area_id   integer not null → service_areas,
  measure_def_id    integer not null → measure_definitions,
  -- optional dimension-member columns (nullable; set per relevance family):
  payment_mode_id     integer → managed_list_items,   -- tariff
  customer_type_id    integer → managed_list_items,   -- tariff
  provider_id         integer → managed_list_items,   -- generation
  technology_id       integer → managed_list_items,   -- generation (leaf; category/asset_class derive)
  utility_function_id integer → managed_list_items,   -- transmission (= the Transmission member)
  is_relevant       boolean not null,
  source            text    not null,                 -- 'declared' | 'derived_stint'
  is_deleted        boolean not null default false,
  -- provenance (transferred from the span spec's amend rule):
  change_reason_id  integer → managed_list_items,
  created_at, created_by_id, updated_at, updated_by_id
)
```

- **Uniform read surface (guardrail 1).** For a conditional measure the generator reads *only*
  `measure_relevance` to decide which `(period, area, measure[, dims])` slices exist. It never reads
  stints or the old per-mechanism tables directly.
- **`source` discriminator:** `'declared'` (transmission + tariff, service-written) vs
  `'derived_stint'` (generation, engine-projected from `unit_activations` overlap).
- **Unique address:** UNIQUE `(report_period_id, service_area_id, measure_def_id, payment_mode_id,
  customer_type_id, provider_id, technology_id, utility_function_id)` **NULLS NOT DISTINCT**, partial
  `WHERE is_deleted = false` — one verdict per address among live rows. `source` is not in the
  address; an address is either declared or derived, never both.
- **Dimension columns are frozen at five** (#2-verified against the 38-measure by_context inventory):
  generation needs provider+technology only (category/asset_class derive from technology via
  `parent_id` ancestry — confirmed Technology→Category→Asset Class); tariff needs
  payment_mode+customer_type; transmission needs utility_function. No generation measure slices
  `by_context` on a non-energy dim outside this set.
  - **`band` (consumption block) is NOT a relevance dimension.** Tariff measures 502/503 slice by
    `band`, but band is the tariff's internal block *structure* (which consumption tier), resolved in
    the scope/shell-generation layer — relevance stays per `(customer_type, payment_mode)`. So the two
    tariff columns suffice; band never enters `measure_relevance`.

## 4. Declared vs derived — who writes which

- **Declared** (`source='declared'`) — **transmission + tariff.** Service-written from the entry UI
  (§7). Editorial yes/no.
- **Derived** (`source='derived_stint'`) — **generation + purchases.** Engine-projected from
  `unit_activations`; never hand-entered. Stints remain the **SOLE truth**. Rule: **the derived family
  = stint-presence ∩ the measure's provider applicability** — one projection, no per-measure machinery.
  A measure is relevant for `(area, provider, technology, period)` iff a stint of a unit with that
  provider+technology (provider ∈ the measure's applicability) overlaps the period at that area —
  including §3.3 **cross-SA splits**.
  - **Owned generation** (applicability incl. Utility): the owned fleet.
  - **Purchases — 431** (applicability = {IPP, Customer}): lights up from IPP/Customer stints. A
    utility with no provider units structurally cannot purchase, so it gets no shell; the derivation
    governs who is asked. **Support case:** "we buy power but have no purchases shell" → register the
    provider unit (which also fixes the fleet picture), never a hand-added relevance row.
  - _(Fleet-modeling note: customer feed-in — rooftop / net-metering — should be Customer-provider
    aggregate units for generation-tracking completeness; #8 carries it to the joint pass as
    unit/fleet-model territory, [unit-lifecycle-spec.md](unit-lifecycle-spec.md).)_

## 5. Transmission — a per-area declaration materialised as coherent slice rows (#8 ruling A)

Transmission is **not** standalone measures — it is the **`utility_function=Transmission` slice** of
the 13 measures that scope `by_context` on utility_function (network: 340–343, 410, 411, 420; labour:
141, 142, 270, 290–292). Those 13 host measures stay **`relevance_mode='unconditional'`** — their
*other* slices (Distribution, etc.) are always relevant; only the **Transmission member** is
context-gated. So transmission is a **member-level gate**, layered on otherwise-unconditional
measures — encoding it as a measure-level `conditional_default_off` would wrongly suppress their
distribution slices.

The real-world fact is **per-area** ("area A has transmission"). Storing it as 13 independent
per-measure rows risks incoherent states (network-length transmission-relevant but
downtime-transmission not). So:

- **The declaration is the BLO's single per-area toggle** (an event) — "Area A has transmission this
  period? ✓". #11's single-toggle UI is exactly this.
- **The 13 rows are its materialisation** — the service writes them **atomically, all-13-or-none**
  (`source='declared'`, `utility_function_id=Transmission`, one per host measure). Individual
  transmission rows are **never hand-edited**.
- **Coherence invariant** (verifier, guardrail): the Transmission-slice rows agree per `(area,
  period)` — all conditional host measures relevant together or none. No incoherent state reachable.

**Joint-pass detail (i):** the utility-grain labour measures (141/142/270/290–292) gate on
*∃ area-with-transmission* for the utility. Lean: the **generator derives** that ∃ from the area
declarations (fewer rows, one fact) rather than the service writing separate utility-grain rows.
**Detail (ii):** the per-area declaration event carries append-vs-amend + provenance like everything
temporal (§7).

## 6. Guardrails + generator scope

**Guardrails** (spec §4 case law):
1. `source` discriminator on every row.
2. **Writer/UI reject manual edits on `derived_stint` rows** (engine-owned; change the stint).
3. **Regeneration hooks on stint append/amend** regenerate affected derived rows — same hook as the
   amend-reflow rule; **delete+reinsert per affected (unit × period) scope, one txn** (a shortened
   stint must retract rows, so upsert needs a paired delete-missing anyway).
4. **Verifier invariants:** (a) stint-overlaps ↔ `derived_stint` rows 1:1 both directions; (b)
   transmission-slice coherence per `(area, period)` (§5).

**Generator scope (#8 ruling — forward-generative + historical-reconcile):**
- **New periods:** fully generative — every conditional slice's existence is governed by
  `measure_relevance`; unconditional measures shell from grain × scope.
- **Migrated/historical periods:** **reconcile, do not cull.** Migrated shells are p1 truth,
  authoritative; the generator never deletes a historical shell for lacking a relevance row. The
  consistency gate (#2) **verifies** (fails loud on orphan either direction) but does not delete.

## 7. Carry-forward + entry UX (declared rows) — #11

- **Declared relevance carries forward by materialised per-period roll-forward:** at period creation,
  copy the previous period's `declared` rows into the new period; the confirm-each-period UX edits
  the pre-populated rows (confirm = no-op, change = edit). Derived rows need no roll-forward (they
  regenerate from stints). Both paths yield explicit per-period rows → the surface is uniformly dense,
  zero read-rules.
- **UI presents ONE normalised toggle per row** — "Applies this period? ✓/✗" — and the **service
  translates** to storage polarity (declare-true for a `conditional_default_off` family; suppress-
  false for `conditional_default_on` tariff). The BLO never sees two mental models. Polarity is a
  storage/migration concern, invisible at the UI (#11).
- **append-vs-amend + the three consequence rules** transfer here and to the transmission declaration
  event: amend **reflows** the period's shells + denominators; **snapshots pin / live absorbs**
  (frozen reports never rewritten — surface in "Updated (Final)"); amend carries **provenance**
  (`change_reason_id` + who/when), append needs none. Same family as stint edits.

## 8. The classification criterion (record it — it prevents the next mis-build)

**Rich timeline state → stints/spans. Yes/no or per-cell editorial declarations → `measure_relevance`.**
A stint/span fits what carries state attributes (a unit at capacity C; a *rated* line). A relevance
row fits a yes/no or per-cell editorial decision with no state to carry. Transmission sits on the
relevance side **because Eugene descoped the electrical rating** (2026-08-26) — with no rated-asset
state to carry, it is a yes/no declaration, not a timeline-state asset.

## 9. Migration / cutover (#2) — rides the coordinated temporal-spans package

- **Backfill `relevance_mode`** — authoritative id→mode list derived by #2 from the by_context
  inventory (2026-08-26), criterion + counts:
  - **`conditional_default_off` (16)** — the derived family (§4, stint-presence ∩ provider
    applicability): owned/IPP-output generation (320, 321, 330–333, 360–363, 380, 381, 390, 391, 392)
    **+ 431 Electricity Purchased** (lights up from IPP/Customer stints). `effective_from=2026` → 431
    has 0 migrated shells regardless; its mode governs 2026+ forward only.
  - **`conditional_default_on` (4)** — tariff inputs: 500, 501, 502, 503 (all Financial/Tariff
    Structure, `is_calculated=false`; 500 is the tariff-VAT *input*, not the computed bill).
  - **`unconditional` (the rest, ~97)** — the 13 utility_function transmission hosts (141/142, 270,
    290–292, 340–343, 410/411, 420 — transmission rides as a member-level gate on their
    utility_function=Transmission slice) and all non-sliced single-value measures.

> **431 note — TERMINAL, do not reopen async.** 431 = `conditional_default_off` (derived). This flag
> flipped repeatedly on crossed messages; the committed value here at HEAD is the sole source of truth.
> Reopening requires a synchronous resolution or Eugene, never a queued message. Zero migration impact
> (effective-2026).
- **Create `measure_relevance`** (5 dim columns).
- **Tariff → declared:** tariff is `conditional_default_on`, so migrate its **suppress rows** — the
  139 `is_relevant=false` cells become `declared` suppress rows; the 40 redundant-true are dropped
  (default already relevant). No dense materialisation of the relevant grid (that was the default-off
  trap).
- **Transmission → declared:** none to migrate (0 rows). Seed per-area declarations for the areas that
  carry transmission shells today (best-effort from current data, AFTER data_entries reload), then the
  service materialises the 13 slice rows.
- **Generation → derived:** project from seed stints (guardrail 4a). Retire `units.period_entries`
  (is_active→derived rows, capacity→stint state).
- **Drop `transmission_relevance`** atomically with its 5 code refs (#11: route + settings UI/service;
  #2: migration/service.ts + schema). `tariff_relevance` retired after migrate-in.

## 10. Ownership

- **#4 (schema):** `measure_relevance` DDL, `relevance_mode` column, the generator read + verifier
  invariants (§6).
- **#8 (grain / relevance semantics):** the `derived_stint` projection, the transmission
  declaration→materialisation semantics + coherence invariant, the classification criterion.
- **#11 (entry UI):** the single-toggle confirm/roll-forward UX + the per-area transmission toggle +
  service translation.
- **#2 (migration):** §9. Rides the reimport.

## 11. Open — confirmed at the joint spans+stints+relevance pass

- **Transmission encoding confirm (#4→#8):** the 13 host measures stay `relevance_mode='unconditional'`
  and transmission is a **member-level gate** on their `utility_function=Transmission` slice (not
  measure-level `conditional_default_off`, which would suppress their distribution slices). Flagged to
  #8 for confirmation; encoded that way here.
- **Labour-measure ∃-transmission** (§5 detail i): generator-derives vs service-writes — lean
  generator-derives.
- **Derived-row regen** = delete+reinsert per (unit × period) scope (§6.3), confirmed at the joint pass.
