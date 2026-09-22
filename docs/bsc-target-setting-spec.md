# BSC target-setting — semantics & UX spec

_Status: **DRAFT** (#5 BSC Builder, 2026-09-22). Design-only; no build until #3's
guarded set-target service exists and #2 has applied `kpi_target` (#534) to p2._

Owns: **target semantics / UX** per the ratified
[kpi-target-actual-contract.md](kpi-target-actual-contract.md) §1 (Eugene,
2026-09-09). This document is the target-**setting** side of that contract: who
sets a target, on what, at what grain, through what flow — and the exact
interface I need from the service #3 owns. It does **not** redefine the shared
address (that is #3/#8's contract) — it consumes it.

---

## 0. Where targets are set today (the thing being replaced)

Goal-value targets live in **`kpi_definitions.targets`** — a JSON array of
`{ utility_id, year, month?, target_value }`. Two surfaces blind-write it:

| surface | path | behaviour today |
|---|---|---|
| **Direct KPI-target UI** | `app/settings/kpi/targetsEditor.tsx` → `SaveKpiTargets` (`app/settings/kpi/service.ts`) | reads the JSON, keeps other utilities' entries, merges this utility's rows by year/month, writes the array back |
| **BSC Build mode** (mine) | `components/data-entry/new-bsc-kpi-targets.tsx` → `saveKpiTargets` (`new-bsc/repository.ts`) | same JSON, same merge-by-year/month write-through |

A separate **target plan** (generated period set per utility/KPI, drives the
"Targets-set" pills) already lives relationally in `bsc_kpi_target_plan`
(migration 0026) via `saveKpiTargetPlan`.

**Gaps vs. the ratified `kpi_target`:** the JSON carries no sub-utility grain, no
dimension slices, no provenance (`set_by`/`set_at`), no `source`, and no
one-target-per-cell guard — two surfaces silently overwrite each other's
year/month cell. The contract fixes all of that; this spec drives the setting UX
onto it.

---

## 1. Principles (inherited from the contract — restated for the UX)

1. **Utility-set only.** Every target a BLO sets is the utility's own. `source`
   records only *how* it was entered — `bsc` from here, `direct` from the
   settings page. Both are the utility; either can override the other (§4).
2. **One target per exact address.** No silent overwrite anywhere — setting onto
   an occupied cell always raises the override alert (§4).
3. **Utility-or-finer grain only.** A target attaches to an accountable entity.
   Above-utility figures are benchmarks, not targets, and are not settable here.
4. **No roll-up, no carry-forward.** A target is a declaration *for its period* at
   *its address*. Multi-period plans are explicit per-period rows; absence next
   period = no target, never inheritance.
5. **Authority (PPA/Country) targets are peers, not utility targets** — read-only
   here, shown alongside, never conflated (§7).

---

## 2. Service interface I need from #3 (the ask)

The BSC never writes `kpi_target` directly. It calls **one guarded set-target
service** (semantics owned by #3). I need this shape:

```ts
type TargetAddress = {
  kpiDefId: number;
  periodId: number;              // canonical period dim (NOT report_periods)
  grain: {                       // utility→unit chain, filled level→root, NULL below
    utilityId: number;           // required (utility-or-finer)
    countryId?: number; subregionId?: number; region?: string;
    serviceAreaId?: number; powerStationId?: number; unitId?: number;
  };
  dims: {                        // 10 slices, explicit All by default
    providerId: number; categoryId: number; technologyId: number;
    assetClassId: number; customerTypeId: number; paymentModeId: number;
    consumptionBandId: number; divisionId: number; genderId: number;
    utilityFunctionId: number;
  };
  owningOrgId: number;
};

// Set / update — never silent on a collision.
setTarget(addr: TargetAddress, value: string, opts: {
  source: "bsc";
  setBy: string;                 // user id
  confirmOverride?: boolean;     // must be true to overwrite an existing cell
}): Promise<
  | { status: "ok" }
  | { status: "conflict"; existing: { value: string; source: "direct"|"bsc";
        setBy: string; setAt: string } }         // caller re-calls with confirmOverride
  | { status: "eval_coverage_warning"; message: string;  // §5 (rule from #8)
        proceed: "confirm" }                      // caller re-calls acknowledging
>;

// Read for display — the BSC scorecard view.
listTargets(scope: {
  utilityId: number; periodIds?: number[]; kpiDefIds?: number[];
}): Promise<Array<{
  addr: TargetAddress; value: string | null;
  source: "direct"|"bsc"; setBy: string; setAt: string;
  authorityValue?: string | null; authoritySource?: "PPA"|"Country";  // §7 (later)
}>>;
```

Notes for #3:
- The **eval-coverage guard** content is **#8's** (contract §2.3) — the service
  invokes #8's callable predicate; I consume its `message`/`proceed` verbatim,
  I don't author the rule. I'll ping #8 to consume it when the service is built.
- Conflict and eval-coverage are **two distinct pre-checks**; the UX (§4, §5)
  surfaces them as two different confirmations, so please keep them separable in
  the return, not collapsed into one flag.

---

## 3. Grain & dimensions in the BSC UX

- **Default grain = the scorecard's utility.** The BSC Build mode is always in one
  utility's context, so `grain.utilityId` is fixed and every other grain column
  defaults NULL (utility grain). This is the 90% path — a single value per period.
- **Finer grain is opt-in per tracked metric.** If the metric computes below
  utility (station/unit), the BLO may target at that grain via an explicit
  "target by station/unit" toggle; each finer address is its own cell. Never
  offered above utility.
- **Dimensions default to explicit All.** All 10 dims resolve to their All member
  unless the metric is defined by a dimension (e.g. a per-customer-type KPI), in
  which case the BLO sets one target per relevant slice. The picker only offers
  dims the KPI actually varies over — no combinatorial explosion.
- **Guard rail:** the set-time eval-coverage check (§5) warns when the chosen
  grain/dim address has no matching actual computation, so a BLO can't quietly
  target a cell that will never be evaluated.

---

## 4. Override-alert flow (the no-silent-overwrite rule, in UX terms)

When the BLO saves a target for a cell that already holds one:

1. Service returns `conflict` with the existing `{ value, source, setBy, setAt }`.
2. BSC shows a modal — **never** a silent overwrite:
   > **A target already exists for this cell.**
   > Current: **`<value>`** · set via **`<direct | this BSC>`** by **`<name>`** on **`<date>`**.
   > Replace it with **`<new value>`**? [Keep existing] [Replace]
3. Only **Replace** re-calls `setTarget` with `confirmOverride: true`.
4. `direct`↔`bsc` collisions read naturally ("set via the KPI targets page")
   so the BLO understands where the other value came from. Both are the
   utility's own, so either may win — the human decides, explicitly.

---

## 5. Set-time evaluation-coverage warning (rule = #8, surface = me)

At set/update the service runs #8's predicate: does the KPI produce (or is it
configured to produce) an actual at this exact address?

- **No match** → warning, not a block:
  > This target's grain won't be evaluated: `<KPI>` doesn't compute at
  > `<grain/dim address>`. Save anyway?  [Change grain] [Save anyway]
- Acknowledging re-calls the service with the coverage confirm. Same
  no-silent-wrong family as the override alert — the BLO is never left with a
  target that silently never matches an actual.

---

## 6. Per-period plan surface (replaces the removed trajectory)

- Multi-period targets are entered as **explicit per-period rows** — a compact
  grid of **period × target value** for the tracked metric, one row per period
  the BLO chooses. **No auto carry-forward** (contract ruling C): an empty period
  = no target for that period, shown as such.
- The existing `bsc_kpi_target_plan` (generated period set → "Targets-set" pills)
  stays as the *plan skeleton* (which periods are in scope); the **values** move
  from the JSON to `kpi_target`, one row per (address, period). The pill's
  "targets set N/M" reads from `kpi_target` presence, not the JSON.
- `new-bsc-kpi-targets.tsx`'s existing period generator (`buildPeriods` by
  frequency + start + count) becomes the picker that proposes the period columns;
  each column's value is a `setTarget` call. Its frequency-derived periods must
  resolve to **canonical `period.id`** (via #2's period dim), not ad-hoc
  year/month.

---

## 7. Authority (PPA / Country) targets — read-only peer in the BSC

- Per contract §4 (planned additive extension): a cell may carry, beside the
  utility's own value, an `authority_target_value` + `authority_source ∈
  {PPA, Country}`.
- In the BSC these are **display-only**: the scorecard shows **actual · utility
  target · authority target** as three distinct values, never merged, never
  editable by the BLO. Authority targets are set elsewhere (PPA/Country tooling),
  not in Build mode.
- They never participate in the override rule (§4) — that governs only the
  utility's own value.
- Until §4 is built, the BSC simply shows no authority column; adding it later is
  additive UX.

---

## 8. Input-tracked metrics — target-setting DISABLED until additive spec lands

A direct consequence of my own 2026-09-22 ruling (Input-tracked targets are
additive-later; `kpi_target` ships `kpi_def_id`-keyed only):

- The "+ Add KPI" picker lets a BLO track a **measure_definition (Input)** as well
  as a KPI. An Input-tracked item has **no `kpi_def_id`**, so it has no address in
  the initial `kpi_target`.
- **Therefore, in Build mode, target-setting is disabled for Input-tracked
  metrics** — the target control shows a clear, non-blocking note:
  > Targets for Input-tracked metrics are coming soon.
- KPI-tracked metrics get the full flow above. This keeps the UX honest rather
  than writing Input targets somewhere they can't be evaluated.
- When I settle the Input-target mechanism and hand #4/#2 the additive spec
  (routed past #8 first — the address contract is #8-ruled), this gate lifts and
  Input-tracked items gain the same flow.

---

## 9. Migration of existing JSON targets → `kpi_target` (semantics; #4/#2 execute)

I specify the mapping; #4 authors, #2 applies (behind Eugene's direct word):

| JSON field | `kpi_target` |
|---|---|
| `utility_id` | `grain.utilityId` (utility grain; all finer NULL) |
| `year` + `month?` | `period_id` — resolved via the canonical period dim (month → monthly period; null month → the FY bucket) |
| `target_value` | `value` |
| — | all 10 dims → **All** member |
| — | `source` → **`direct`** (historic JSON is indistinguishable by surface; treat as direct-set) unless a BSC-origin marker exists |
| — | `set_by` → a migration/system user; `set_at` → migration timestamp |
| — | `owning_org_id` → the utility's org |

One-per-cell dedupe on the full address (the JSON already dedupes by
year/month per utility, so collisions should be none; log any). After
migration the `kpi_definitions.targets` column is retired (destructive — apply
**only after** the new code is live, per expand/contract).

---

## 10. Build sequencing & handoffs

Nothing here builds until:
1. ~~#2 applies `kpi_target` (#534) to p2~~ **DONE — live on p2 (Eugene-greenlit, 2026-09-22).**
2. **#3 builds the guarded set-target service** (§2) — the remaining gate; itself
   pending Eugene prioritising the target write-path.

Then, in order (all mine unless noted):
1. Repoint **both** `SaveKpiTargets` (direct) and BSC `saveKpiTargets` off the
   JSON onto the service. (Direct UI is a peer surface; I own the semantics, its
   owner and I coordinate the swap.)
2. BSC Build-mode target UX: per-period grid (§6), override modal (§4),
   eval-coverage warning (§5, rule from #8), Input-tracked disable (§8).
3. Read path: scorecard shows actual · utility target (· authority target when §4
   lands) from `listTargets`.
4. Migrate JSON → `kpi_target` (§9); retire the JSON column (expand/contract).
5. Input-tracked targets: settle the mechanism → additive spec past #8 → #4/#2.

**Open items for peers:** #3 — does the service return conflict & eval-coverage as
separable results (§2)? #8 — confirm the eval-coverage predicate is callable at
set-time with a UX-ready message. #4 — the JSON→kpi_target backfill (§9) rides
your DDL package or a follow-on?
