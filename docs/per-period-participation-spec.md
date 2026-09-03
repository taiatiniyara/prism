# Per-Period Benchmarking Participation (p2)

**Status:** v3 — cross-stream review converged (#2 schema, #8 worker/shells, #10 access/onboarding all folded in). Remaining gates are **Eugene's policy calls + his direct greenlight for #2 to build** (see §8).
**Author:** #3 (calculator), from Eugene's 2026-09-03 direction; reviewed by #2, #8, #10.
**One-line:** Benchmarking data and calculations exist for a `(utility, period)` **only when the utility has explicitly opted into benchmarking for that period** — replacing p1's "every utility gets shells" model that littered `data_entries` with unsubmitted stubs.

---

## 0. The four-layer stack (framing — #8)

Participation sits **above** relevance; naming the stack keeps the gates from blurring:

1. **Participation** — does this `(utility, period)` exist for benchmarking at all? *(this spec)*
2. **Relevance** — which dimension slices apply (measure scope / expansion mode).
3. **Obligation** — which of those must be answered (required vs optional).
4. **Assertion** — the answer itself (`data_entries` value, or `no_data_reason`).

Each layer's absence is **skip, never fail**: a non-participated period isn't an error any more than an out-of-scope slice is.

## 1. Problem (p1 behaviour)

In Prism 1, report-period **shells were auto-generated for every utility just by virtue of being a utility**, on the assumption they'd populate them. Utilities that never submitted left the shells empty — so `data_entries` carries **unnecessary rows for periods nobody participated in**, and every benchmarking calculation that touches those periods reports spurious "missing input" failures.

**Observed in p2 today (audit 2026-09-03):**
- Of **128** report-periods belonging to participating utilities (`is_utility=true AND organisations.bm_participates=true`): **68 have real submitted data** (genuinely participated) and **60 are pre-participation shells** (report-period exists, zero real data).
- **17** stray `data_entries` rows sit under **non-participating** utilities (`bm_participates=false`) across 12 periods. **Verified 2026-09-03: all 17 are `Total Costs` (calculated, value 0) or `Hours in Period` (system-generated, 8784) — none carry a real entered value.** (#8's data-preservation check → clean; safe to delete, still backed up first.)
- ~**9** pre-participation shells already carry a stray system-generated `Hours in Period` row.
- These are exactly what makes e.g. Generator Availability/Outage/Capacity KPIs (#97–100) report `Missing formula inputs: hours_in_period` — for periods no one participated in.

## 2. The p2 model

Participation is **explicit and per-period**, not inferred from "is a utility." A utility joins Prism, and **from the period they opt in onward** they participate; earlier periods are simply not part of benchmarking.

**Submission workflow (the new gate):**
1. A submission becomes due for a utility → **email reminder** sent (to the org's `is_primary_contact`). *(#10)*
2. Utility logs in and **explicitly ticks the benchmarking opt-in** for that period (sets `bm_opted_in = true`). *(#10)*
3. They **review/update** their reference data for the period: **service areas, generators, IPPs, tariffs**. *(#8)*
4. **Only then** are the **relevant shells generated** for that period. *(#8)*
5. No opt-in → no shells → no data → no compute for that `(utility, period)`.

**Clean handoff at the tick:** #10 owns steps 1–2 (reminder → tick → set flag); #8 owns steps 3–4 (review reference data → generate shells).

## 3. Data model — two flags on two layers

Add an **explicit per-period participation flag** on the period row:

- **`report_periods.bm_opted_in boolean NOT NULL DEFAULT false`** — deliberately distinct from the org-level `organisations.bm_participates` to avoid a same-name-different-meaning footgun.
- Semantics: *this utility opted into benchmarking for this specific report period.* Set `true` at step 2; shells (step 4) and all compute key off it.
- **Table-rename heads-up (#10/#8):** `report_periods` is being renamed to **`submissions`** by #8's time-series work. **Land the flag on the final table name** so the schema doesn't churn — #2 to sequence the column add with the rename.

**Access layer vs data layer — the two flags do NOT collapse (resolved with #10):**

| | Governs | Predicate |
|---|---|---|
| **Org-level** `is_utility AND organisations.bm_participates` | **ACCESS** — WebApp visibility (full app) + PBI plan reference gate | 2-way, org only |
| **Per-period** `+ report_period.bm_opted_in` | **DATA / compute** — shells, KPI + measure compute, hours generation | 3-way, the canonical predicate |

- The org flags stay as **eligibility**: "this org is a benchmarking-eligible utility, gets the full app, and is *shown* the per-period opt-in." They are **not subsumed** by the per-period flag.
- **Why access can't gate on `bm_opted_in`:** a utility needs full-app access to log in and *perform* the per-period opt-in — gating access on the opt-in would be chicken-and-egg (#10).
- Only org-level-eligible utilities are ever shown the opt-in; `bm_opted_in` then records the actual per-period decision.
- **Canonical "is this period benchmarked" predicate (the data/compute gate):**
  `org.is_utility = true AND org.bm_participates = true AND report_period.bm_opted_in = true`.

## 4. Compute & generation gating — ONE predicate helper (owned by #3 + #8)

Everything that reads/derives benchmarking values gates on the canonical predicate — a non-opted-in period is **skipped, never "failed."**

**Single choke point (#8, agreed):** the predicate is about to appear in ≥4 places (KPI gate, aggregated worker gate, hours generation, shell generation). Write it **ONCE** — do not hand-roll four copies:

- **`isBenchmarkingParticipant(utilityId, reportPeriodId): boolean`** in `lib` (+ its **SQL twin**, parity-welded the way `fiscal_year` is, if a set-based query needs it). Every gate calls it.
- **Extra reason it must be a choke point:** the predicate contains `is_utility`, which **#10's two-axis model retires** (→ `relationship = 'utility'`). When that lands, the swap happens in **one line** instead of a hunt across gates.
- **#3 owns the shared helper** (owns the KPI gate + it's a generic lib util); #8, #10, hours + shell generation all call it.

Call sites:
- **KPI recompute** (`recomputeKpiNow`) — today gated on `organisations.bm_participates` only (`app/data-entry/kpi-worker/recompute.ts`); tighten to the full predicate via the helper. *(#3)*
- **Calculated-measure compute** (aggregated worker `runAggregatedWorker` / `computeCalculatedMeasureValues`) — currently ungated; add the helper so it never computes a non-participated period. *(#8's worker; #3 orchestrates via `recomputeCalculatedMeasuresNow`)*
- **`hours_in_period` generation** (`lib/period-hours.ts` + the interactive data-entry path) — generate only for participated periods; the blanket `scripts/backfill-hours-in-period.ts` must call the helper. *(#8 / #3)*
- **Shell generation** (step 4) — keyed on the flag. *(#8)*

## 5. One-time migration for existing data (owned by #2, with #8)

Retrofit the flag to the historical truth, then clean up.

### 5.1 Backfill the flag

**Authoritative signal — Eugene's per-utility start years (2026-09-03, "from memory" → #2 verifies against data):** of the 20 `bm_participates=true` utilities:

| Utility | Opted in from | Set `bm_opted_in=true` for |
|---|---|---|
| **NUC** | **FY2020** (submitted FY2020 data) | periods FY2020 onward |
| **NPC** | **FY2025** | periods FY2025 onward |
| **all other 18** | **FY2022** | periods FY2022 onward |

Everything before a utility's start year → `bm_opted_in = false`.

**Cross-check (not the primary signal):** the data-presence heuristic — a period has ≥1 real submitted value (a `data_entries` row on a measure that is **not** `is_system_generated` and **not** `is_calculated`) — should broadly agree with the start-year mapping. #2 reconciles the two before writing; where they disagree, the explicit start year wins but the discrepancy is surfaced to Eugene. (`is_system_generated` / `is_calculated` confirmed live `measure_definitions` columns, 2026-09-03 audit.) Going forward the flag is set explicitly by the opt-in UX, so this retro-backfill is one-time.

### 5.2 Period-status reconciliation (#8 — one stated rule, #2 implements)

Model-A left ~147 periods `Approved`; only 68 genuinely participated. An **`Approved` period that was never opted in is semantically wrong** (Approved = the CEO's act on submitted content). The backfill states the rule:

- **Genuinely participated** (opted in per §5.1) → `bm_opted_in = true`, **status stands**.
- **Pre-participation / non-participating** → `bm_opted_in = false` **AND** status reset to **Pending** (or the period soft-retired). **Never `Approved`-but-not-participating.**

### 5.3 Cleanup unnecessary entries (only after 5.1/5.2 agreed)

**Back up every deleted row to a `backup.*` table first** (#2's Option-B pattern; cheap + recoverable):

- **Audit trail on every excluded row (Eugene, 2026-09-03):** each backed-up / excluded row records, beside the data, the **utility acronym** and the **reason for exclusion/opt-out** (e.g. `non-participating-org`, `pre-participation-shell`, `withdrawn-after-opt-in FY2025`). So the `backup.*` schema carries `utility_acronym` + `exclusion_reason` (+ excluded-at timestamp); nothing is dropped without a legible why-and-who. Applies to both the cleanup below and the §7 withdraw-after-data case.
- Delete `data_entries` under non-participating orgs (`NOT (is_utility AND organisations.bm_participates)`) — the **17** stray rows (verified §1: all system-generated/calculated, zero real values → clean to delete). Any stray that *did* carry a real value would get soft-delete/preserve + Eugene disposition per the CUC-fuel precedent — none do here.
- Delete system-generated / calculated `data_entries` on periods where `bm_opted_in = false` (the ~9 shells with stray `hours_in_period`, plus any computed values on shells).
- **Pre-participation period rows: KEEP, flagged `false`** (they carry the period timeline/status/FYE placement and are FK-referenced by the FYE/time-series work; deleting risks gaps/orphans). Delete only stray **data**, never period rows.

### 5.4 Git-before-DB (+ backup)

Additive flag column (§3) is safe to apply promptly after merge; the `DELETE`s + status resets are DML — git-first, backed up, applied only after 5.1/5.2 are agreed and Eugene greenlights.

## 6. Ownership & sequencing

1. **#2** — add `report_periods`/`submissions`.`bm_opted_in` (schema, on the final table name), then run the §5 backfill + status reconciliation + cleanup SQL. *(blocks everything)*
2. **#3** — write `isBenchmarkingParticipant()` (lib + SQL twin, §4); gate KPI + `hours_in_period` compute on it. *(depends on #2's flag landing)*
3. **#8** — review-reference-data → generate-shells (step 4) keyed on the flag; aggregated-worker gate via the helper; period-status rule input. *(depends on #2)*
4. **#10** — opt-in UX: reminder email → opt-in tick → set `bm_opted_in=true`; keeps org-level flags as the access/eligibility gate; folds the flag into the consolidated tiered-access pass. *(depends on #2)*

## 7. Decisions & open questions

**Resolved:**
- **Flag name** — `bm_opted_in` on the period/`submissions` row (distinct from org `bm_participates`). *(#2, #10)*
- **Org-flag relationship** — **KEEP as eligibility, not subsumed.** Org flags govern access; the per-period flag governs data/compute. Two layers, shared terms. *(#10)*
- **Single predicate helper** — `isBenchmarkingParticipant()`, one choke point, lib + SQL twin. *(#8, #3)*
- **17 stray rows** — verified all system-generated/calculated, zero real values → clean to delete (backed up first). *(#3 verify, #8 concern)*
- **Period-status rule** — non-participating periods never stay `Approved`; reset to Pending / soft-retire. *(#8)*
- **Pre-participation period rows** — KEEP, flagged `false`; delete only stray data. *(#2)*
- **Delete safety** — back up to `backup.*` first; additive column promptly after merge, DML git-first + after backfill agreed. *(#2)*
- **Table rename** — land the flag on the final `submissions` name; #2 sequences with #8's rename.

**Resolved (Eugene, 2026-09-03):**
- **Backfill start years** (§5.1) — **CONFIRMED** authoritative: NUC FY2020 / NPC FY2025 / all others FY2022 (data-presence is the cross-check; #2 flags any mismatch).
- **Re-open / withdraw policy** — **AGREED** as #10 proposed: before data → un-tick removes/never-generates shells; after data → `bm_opted_in=false` keeps the entered data (backed up) and the predicate excludes it — never a silent delete. **Refinement:** every excluded row records the utility acronym + exclusion/opt-out reason beside the data (§5.3 audit trail).
- **Eugene's direct greenlight** — **GIVEN.** #2 to proceed with schema (§3) + backfill/status-reconcile/cleanup (§5). #3's helper + compute gating (§4) follow once #2's flag column lands (avoid code-ahead-of-DB). #2 sequences the column-add with #8's `report_periods`→`submissions` rename so the flag lands on the final name.
