# Per-Period Benchmarking Participation (p2)

**Status:** Draft for review — circulated to #2 (schema), #8 (data entry / worker), #10 (onboarding/access), #3 (calculator).
**Author:** #3 (calculator), from Eugene's 2026-09-03 direction.
**One-line:** Benchmarking data and calculations exist for a `(utility, period)` **only when the utility has explicitly opted into benchmarking for that period** — replacing p1's "every utility gets shells" model that littered `data_entries` with unsubmitted stubs.

---

## 1. Problem (p1 behaviour)

In Prism 1, report-period **shells were auto-generated for every utility just by virtue of being a utility**, on the assumption they'd populate them. Utilities that never submitted left the shells empty — so `data_entries` carries **unnecessary rows for periods nobody participated in**, and every benchmarking calculation that touches those periods reports spurious "missing input" failures.

**Observed in p2 today (audit 2026-09-03):**
- Of **128** report-periods belonging to participating utilities (`is_utility=true AND organisations.bm_participates=true`): **68 have real submitted data** (genuinely participated) and **60 are pre-participation shells** (report-period exists, zero real data).
- **17** stray `data_entries` rows sit under **non-participating** utilities (`bm_participates=false`) across 12 periods.
- ~**9** pre-participation shells already carry a stray system-generated `Hours in Period` row.
- These are exactly what makes e.g. Generator Availability/Outage/Capacity KPIs (#97–100) report `Missing formula inputs: hours_in_period` — for periods no one participated in.

## 2. The p2 model

Participation is **explicit and per-period**, not inferred from "is a utility." A utility joins Prism, and **from the period they opt in onward** they participate; earlier periods are simply not part of benchmarking.

**Submission workflow (the new gate):**
1. A submission becomes due for a utility → **email reminder** sent.
2. Utility logs in and **explicitly ticks `bm_participates`** for that period (the opt-in).
3. They **review/update** their reference data for the period: **service areas, generators, IPPs, tariffs**.
4. **Only then** are the **relevant shells generated** for that period.
5. No opt-in → no shells → no data → no compute for that `(utility, period)`.

## 3. Data model

Add an **explicit per-period participation flag** on the period row:

- **`report_periods.bm_participates boolean NOT NULL DEFAULT false`** (name TBD with #2 — same term as the org flag, different table/grain).
- Semantics: *this utility opted into benchmarking for this specific report period.* Set `true` at step 2 of the workflow; shells (step 4) and all compute key off it.

**Relationship to the existing `organisations.bm_participates` (org-level, per #10's tiered-access model):**
- `organisations.is_utility` + `organisations.bm_participates` = *this org is a benchmarking-eligible utility at all.*
- `report_periods.bm_participates` = *this eligible utility actually participated in this period.*
- **Canonical "is this period benchmarked" predicate:** `org.is_utility = true AND org.bm_participates = true AND report_period.bm_participates = true`.
- **Open design point (for #10/#2):** is the org-level flag still needed as an eligibility gate, or does the per-period flag subsume it? (Recommend keeping the org flag as eligibility; the per-period flag as the actual opt-in.)

## 4. Compute & generation gating (owned by #3 + #8)

Everything that reads/derives benchmarking values gates on the canonical predicate above — so a non-opted-in period is **skipped, never "failed"**:

- **KPI recompute** (`recomputeKpiNow`) — today gated on `organisations.bm_participates` only; tighten to include `is_utility` **and** `report_periods.bm_participates`. *(#3)*
- **Calculated-measure compute** (aggregated worker `runAggregatedWorker` / `computeCalculatedMeasureValues`) — currently ungated; add the predicate so it never computes a non-participated period. *(#8's worker; #3 orchestrates via `recomputeCalculatedMeasuresNow`)*
- **`hours_in_period` generation** (`lib/period-hours.ts`, and the interactive data-entry path) — generate only for participated periods; the blanket `scripts/backfill-hours-in-period.ts` must be participation-scoped. *(#8 / #3)*

## 5. One-time migration for existing data (owned by #2 / #8)

Retrofit the flag to the truth already in `data_entries`, then clean up:

1. **Backfill the flag:** for each existing `report_periods` row, set `bm_participates = true` where the period has ≥1 real submitted value (a `data_entries` row on a measure that is **not** `is_system_generated` and **not** `is_calculated`); else `false`. (Retro-captures each utility's start-of-participation.)
2. **Cleanup unnecessary entries** (only after 1 is agreed):
   - Delete `data_entries` under non-participating orgs (`NOT (is_utility AND organisations.bm_participates)`) — the **17** stray rows.
   - Delete system-generated / calculated `data_entries` sitting on periods where `report_periods.bm_participates = false` (the ~9 shells with stray `hours_in_period`, plus any computed values on shells).
   - Decide whether the empty pre-participation **report_periods** themselves are deleted or just kept flagged `false` (recommend: keep, flagged `false` — they carry no data and are cheap; deleting them is a separate rationalisation call for #2).
3. **Git-before-DB:** schema (step in §3) merged first, then the backfill/cleanup SQL applied.

## 6. Ownership & sequencing (proposed — to be agreed)

1. **#2** — add `report_periods.bm_participates` (schema), then run the §5 backfill + cleanup SQL. *(blocks everything)*
2. **#10** — the opt-in UX: email reminder, the `bm_participates` tick at submission, and setting the flag `true` on opt-in. Fits the tiered-access/onboarding model.
3. **#8** — the "review SA/generators/IPPs/tariffs → generate shells" step keyed off the per-period flag; and the aggregated-worker gate.
4. **#3** — gate KPI + `hours_in_period` compute on the canonical predicate (depends on #2's flag + backfill landing first).

## 7. Open questions

- **Flag name** on `report_periods` (`bm_participates` vs `participates` vs `is_benchmarking`) — #2/#10.
- **Org-flag relationship** (§3) — keep as eligibility, or subsume? — #10.
- **Backfill signal** — "has real submitted data" is the pragmatic retro-signal; confirm it matches how #10 wants the historic start-of-participation defined (vs a manual per-utility start period).
- **Pre-participation report_periods** — keep flagged `false`, or delete? — #2.
- **Re-open / withdraw** — can a utility opt out after opting in (and what happens to already-entered data)? — #10/#8.
