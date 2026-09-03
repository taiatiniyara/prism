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
2. Utility logs in and **explicitly ticks the benchmarking opt-in** for that period (sets `report_periods.bm_opted_in = true`).
3. They **review/update** their reference data for the period: **service areas, generators, IPPs, tariffs**.
4. **Only then** are the **relevant shells generated** for that period.
5. No opt-in → no shells → no data → no compute for that `(utility, period)`.

## 3. Data model

Add an **explicit per-period participation flag** on the period row:

- **`report_periods.bm_opted_in boolean NOT NULL DEFAULT false`** — name per #2's review: **deliberately distinct from the org-level `organisations.bm_participates`** to avoid a same-name-different-meaning footgun (the canonical predicate joins both).
- Semantics: *this utility opted into benchmarking for this specific report period.* Set `true` at step 2 of the workflow; shells (step 4) and all compute key off it.

**Relationship to the existing `organisations.bm_participates` (org-level, per #10's tiered-access model):**
- `organisations.is_utility` + `organisations.bm_participates` = *this org is a benchmarking-eligible utility at all.*
- `report_periods.bm_opted_in` = *this eligible utility actually participated in this period.*
- **Canonical "is this period benchmarked" predicate:** `org.is_utility = true AND org.bm_participates = true AND report_period.bm_opted_in = true`.
- **Open design point (for #10/#2):** is the org-level flag still needed as an eligibility gate, or does the per-period flag subsume it? (Recommend keeping the org flag as eligibility; the per-period flag as the actual opt-in.)

## 4. Compute & generation gating (owned by #3 + #8)

Everything that reads/derives benchmarking values gates on the canonical predicate above — so a non-opted-in period is **skipped, never "failed"**:

- **KPI recompute** (`recomputeKpiNow`) — today gated on `organisations.bm_participates` only; tighten to include `is_utility` **and** `report_periods.bm_opted_in`. *(#3)*
- **Calculated-measure compute** (aggregated worker `runAggregatedWorker` / `computeCalculatedMeasureValues`) — currently ungated; add the predicate so it never computes a non-participated period. *(#8's worker; #3 orchestrates via `recomputeCalculatedMeasuresNow`)*
- **`hours_in_period` generation** (`lib/period-hours.ts`, and the interactive data-entry path) — generate only for participated periods; the blanket `scripts/backfill-hours-in-period.ts` must be participation-scoped. *(#8 / #3)*

## 5. One-time migration for existing data (owned by #2 / #8)

Retrofit the flag to the truth already in `data_entries`, then clean up:

1. **Backfill the flag:** for each existing `report_periods` row, set `bm_opted_in = true` where the period has ≥1 real submitted value (a `data_entries` row on a measure that is **not** `is_system_generated` and **not** `is_calculated`); else `false`. (Retro-captures each utility's start-of-participation.) *(`is_system_generated` and `is_calculated` confirmed as the live `measure_definitions` columns in the 2026-09-03 audit.)*
2. **Cleanup unnecessary entries** (only after 1 is agreed) — **back up every deleted row to a `backup.*` table first** (#2's Option-B pattern; cheap + recoverable):
   - Delete `data_entries` under non-participating orgs (`NOT (is_utility AND organisations.bm_participates)`) — the **17** stray rows.
   - Delete system-generated / calculated `data_entries` sitting on periods where `report_periods.bm_opted_in = false` (the ~9 shells with stray `hours_in_period`, plus any computed values on shells).
   - **Pre-participation `report_periods` rows: KEEP, flagged `false`** (agreed with #2 — they carry the period timeline/status/FYE placement and are FK-referenced by the recent FYE/time-series work; deleting risks gaps/orphans. Delete only the stray *data*, never the period rows).
3. **Git-before-DB (+ backup):** the additive flag column (§3) is safe to apply promptly after merge; the `DELETE`s are DML — git-first, backed up, and applied only after the backfill is agreed.

## 6. Ownership & sequencing (proposed — to be agreed)

1. **#2** — add `report_periods.bm_opted_in` (schema), then run the §5 backfill + cleanup SQL. *(blocks everything)*
2. **#10** — the opt-in UX: email reminder, the opt-in tick at submission, and setting `report_periods.bm_opted_in = true` on opt-in. Fits the tiered-access/onboarding model.
3. **#8** — the "review SA/generators/IPPs/tariffs → generate shells" step keyed off the per-period flag; and the aggregated-worker gate.
4. **#3** — gate KPI + `hours_in_period` compute on the canonical predicate (depends on #2's flag + backfill landing first).

## 7. Decisions & open questions

**Resolved (#2 review, 2026-09-03):**
- **Flag name** — `report_periods.bm_opted_in` (distinct from the org-level `bm_participates`; #2's pick).
- **Pre-participation `report_periods`** — KEEP, flagged `false`; delete only stray data (never period rows).
- **Delete safety** — back up removed rows to `backup.*` first; additive column promptly after merge, `DELETE`s git-first + after backfill agreed.

**Still open:**
- **Org-flag relationship** (§3) — keep as eligibility, or subsume? — #10.
- **Backfill signal** — "has real submitted data" is the pragmatic retro-signal; confirm it matches how #10 wants the historic start-of-participation defined (vs a manual per-utility start period).
- **Re-open / withdraw** — can a utility opt out after opting in (and what happens to already-entered data)? — #10/#8.
- **Eugene's direct go** — #2 will not start schema/DDL + the destructive migration off a relay; needs Eugene's explicit greenlight on their pieces (§3, §5) + final confirmation of the flag name.
