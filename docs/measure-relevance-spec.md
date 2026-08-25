# Measure relevance — one standardised surface (declared + stint-derived)

**Status: RATIFIED-BY-DIRECTION 2026-08-26** (Eugene + #8 aligned, B-clean). Author #4 (schema).
**Supersedes:** [service-area-capability-spec.md](service-area-capability-spec.md) (the span model —
its storage shape is replaced; its case law transfers here).
**Related:** [unit-lifecycle-spec.md](unit-lifecycle-spec.md) (stints — the sole truth for
generation), [adr/0004-effective-dated-dimensions.md](adr/0004-effective-dated-dimensions.md),
`lib/relevance/expected.ts` (the verifier that will enforce the invariant).

## 1. The problem — three relevance mechanisms, one job

"Which shells does a utility owe for a period?" is answered today by **three** different
mechanisms, none of them the same shape:

| mechanism | storage | shape | status |
|---|---|---|---|
| Transmission | `transmission_relevance` | period × area × measure, `is_relevant` | 0 rows; **default-ON/suppress** (backwards for a rare capability) |
| Tariff | `tariff_relevance` | period × area × measure × payment_mode × customer_type | 179 rows; per-cell editorial |
| Generation | `units.period_entries` jsonb `is_active` | per-unit, per-period | all 535 units; **being retired** by the stint model |

Three mechanisms → three code paths, three UIs, and (for transmission) a polarity that made it
useless. The fix is **one uniform relevance surface** the shell generator reads, with the rows
produced two ways — *declared* by the utility, or *derived* by the engine from stints.

The **bootstrap principle is retained** (from the superseded span spec): relevance is
**declared, not inferred from the presence of shells** — a newly-commissioned network or a new
generation source becomes relevant by a declaration/derivation, never by the circular "a shell
exists therefore the context exists." What changes is the storage shape, not this principle.

## 2. The model — `measure_relevance`

```
measure_relevance (
  id                uuid pk,
  report_period_id  integer not null → report_periods,
  service_area_id   integer not null → service_areas,
  measure_def_id    integer not null → measure_definitions,
  -- optional dimension-member columns (nullable; set per relevance family):
  payment_mode_id   integer → managed_list_items,     -- tariff
  customer_type_id  integer → managed_list_items,     -- tariff
  provider_id       integer → managed_list_items,     -- generation
  technology_id     integer → managed_list_items,     -- generation
  is_relevant       boolean not null,                 -- default policy: OFF (declare-to-enable)
  source            text    not null,                 -- 'declared' | 'derived_stint'
  is_deleted        boolean not null default false,
  -- provenance (transferred from the span spec's §4 rule 3):
  change_reason_id  integer → managed_list_items,
  created_at        timestamp not null default now(),
  created_by_id     text → "user",
  updated_at        timestamp,
  updated_by_id     text → "user"
)
```

- **Uniform read surface (guardrail 1).** The shell generator reads *only* `measure_relevance`
  to decide which shells exist for a `(period, area, measure[, dims])`. It never reads stints or
  the old per-mechanism tables directly. One table, one code path.
- **Default-OFF / declare-to-enable.** Absence of a relevant row = not relevant. This is the
  polarity flip that fixes transmission (the old table's default-ON needed ~62 suppression rows
  nobody would write). It preserves the bootstrap fix: a new context is turned on by writing a
  row, not by a pre-existing shell.
- **`source` discriminator** separates the two production paths and is the spine of the
  guardrails (§4): `'declared'` (hand-entered) vs `'derived_stint'` (engine projection).
- **Unique address:** UNIQUE `(report_period_id, service_area_id, measure_def_id,
  payment_mode_id, customer_type_id, provider_id, technology_id)` **NULLS NOT DISTINCT** — one
  relevance verdict per address per period (fixes the old tables' silent-duplicate + dedupe-in-code
  smell). `source` is not in the address: an address is either declared or derived, never both.
- **Extensible:** more dimension-member columns can be added if a future relevance family needs
  them; the three current families need only these four.

## 3. Declared vs derived — who writes which

- **Declared** (`source = 'declared'`) — **transmission + tariff.** Hand-entered by the utility
  through the entry UI (§5 carry-forward). These are **editorial yes/no declarations**: does this
  area have transmission this period; is this tariff cell collected.
- **Derived** (`source = 'derived_stint'`) — **generation.** **Engine-projected from
  `unit_activations` stint overlap**, never hand-entered. **Stints remain the SOLE truth** for
  generation existence / location / capacity (unit-lifecycle §5). A generation measure is relevant
  for `(area, provider, technology, period)` iff a stint of a unit with that provider+technology
  overlaps the period at that area — **including §3.3 cross-SA splits: a unit that moves mid-period
  yields derived rows in BOTH service areas** for that period. (SA-shift handling confirmed by #8:
  span-carried SA §2.1 + temporal chain-consistency §3.1 + partition §3.3.)

## 4. Guardrails that make the projection safe (#8)

Because generation rows are a *projection* of stints, the two must never diverge:

1. **`source` discriminator** on every row ('derived_stint' | 'declared').
2. **Writer/UI reject manual edits on derived rows** — a `derived_stint` row is engine-owned;
   the entry UI neither shows it as editable nor accepts a write to it. Generation relevance is
   changed by editing the *stint*, never the relevance row.
3. **Regeneration hooks on stint append/amend** — any `unit_activations` insert/update
   regenerates the affected `derived_stint` rows. This is the **same hook the amend-reflow rule
   already mandates** (span spec §4 rule 1) — an amendment that moves a stint boundary reflows the
   derived relevance + the downstream shells/denominators for the periods it now covers/uncovers.
4. **Verifier invariant** (`lib/relevance/expected.ts`): **stint-overlaps ↔ `derived_stint` rows
   match 1:1, both directions.** A stint overlap with no derived row = missing projection; a
   derived row with no stint overlap = orphan. Either fails the gate.

**B-override is rejected** (case law): `measure_relevance` is NOT a manual-override layer sitting
on top of stint-derived defaults. A pre-built override is an invitation to a stint/relevance
contradiction. A future concrete need for one is an **Eugene-on-evidence escape hatch, never a
silent pre-build.**

## 5. Carry-forward for declared rows — materialized roll-forward (ONE rule)

**Declared** relevance is carried forward by **materialized per-period roll-forward**, not an
implicit read-rule (#8-recommended, #4-adopted):

- **At period creation**, copy the previous period's `declared` rows into the new period.
- The **confirm-each-period UX** (§6) edits those pre-populated rows: confirm = leave as-is,
  change = toggle/insert/delete.

Rationale: explicit rows every period keep the generator's read trivial (no span-vs-period overlap
math for declared relevance) and match `tariff_relevance`'s existing dense shape. **Derived** rows
need no roll-forward — they are regenerated from stints (§4.3). Net: both paths yield explicit
per-period rows, so the surface the generator reads is uniformly dense with zero read-rules.

## 6. Entry UX (declared rows) — #11

Unchanged in intent from the span spec's §4, now writing `declared` rows:
- At submission the entry screen shows the area's **rolled-forward** declared relevance.
- The utility **confirms or updates** ("Transmission network in this area this period? ✓";
  tariff cells). Confirm = no-op; change = edit the row.
- **append-vs-amend + provenance transfer here** (span spec §4): a genuine new declaration vs a
  correction of a past period are different intents; an amend to a past period's declared row
  **reflows** that period's shells + denominators (rule 1), **snapshots pin / live absorbs** (rule
  2), and **carries provenance** — `change_reason_id` + `updated_by_id`/`updated_at`; append needs
  none (rule 3). Same case law as stint edits — one family.

## 7. The classification criterion (record it — it prevents the next mis-build)

**Rich timeline state → stints/spans. Yes/no or per-cell editorial declarations →
`measure_relevance`.**

- A **stint/span** fits what is rare, slowly-changing, and **carries state attributes** (a unit
  exists here at capacity C; a transmission line rated R). Test: "carry-forward" is the natural
  read *and there is state to carry*.
- A **relevance row** fits what is a **yes/no or per-cell editorial decision** with **no state
  attribute** to record (does this area have transmission this period; is this tariff cell
  collected).

Transmission sits on the **relevance** side **because Eugene descoped the electrical rating**
(2026-08-26): with no rated-asset state to carry, it is a yes/no editorial declaration, not a
timeline-state asset. Had the rating stayed in scope, transmission would have been a stint (a
rated line, like a unit). The criterion is stable; the descoping is what placed transmission.

## 8. Migration / cutover (#2)

Rides the coordinated temporal-spans package (`unit_activations` + this):
- **Create `measure_relevance`.**
- **Migrate `tariff_relevance` → `measure_relevance`** as `declared` rows (179 rows,
  payment_mode + customer_type set); then retire `tariff_relevance`.
- **Drop `transmission_relevance`** — verify-before-drop (0 rows confirmed); retire its
  service/UI refs (`app/settings/relevance/service.ts` Get/SetTransmissionDataLabelRelevance,
  the transmission relevance UI, the `transmissionRelevance` schema + `/api/migration/
  transmissionRelevance` route) in the same migration so nothing dangles. **#11/#2 co-own the
  code retirement; #4 lists the refs.**
- **Retire `units.period_entries`** — its `is_active` half becomes `derived_stint` generation
  rows (projected from seed stints); its `capacity_mw` half becomes stint state (unit-lifecycle
  §2.2). Fold into the reimport.
- **Seed generation rows** by projecting the seed stints (§4.3) once the stints load.

## 9. Ownership

- **#4 (schema):** `measure_relevance` DDL + the shell generator's read + the verifier invariant
  (§4.4).
- **#8 (grain / stint semantics):** the `derived_stint` projection rules (which stint overlaps →
  which rows, incl. §3.3 splits), the regeneration hook, and the classification criterion (§7).
- **#11 (entry UI):** the declared-row confirm/roll-forward UX (§6).
- **#2 (migration):** §8 — tariff migrate-in, transmission drop + code retirement, period_entries
  fold, generation seed-projection. Rides the reimport.

## 10. Open detail

- **`is_deleted` vs hard-managed derived rows:** declared rows soft-delete (audit); derived rows
  are engine-regenerated, so a stale derived row is *replaced*, not soft-deleted. Confirm the
  regeneration is a clean delete+reinsert (or upsert) of the derived set per stint change — #4/#8
  at DDL time.
- **Dimension-column set:** the four current columns cover transmission (none), tariff
  (payment_mode, customer_type), generation (provider, technology). Confirm no generation shell
  needs a further dim (source/asset) in the relevance address before freezing the columns.
