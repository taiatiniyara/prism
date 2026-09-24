# Percent-scale convention + data-quality cleanup worklist

**Decision (Eugene, 2026-09-25).** Values for a percentage/proportion quantity are stored as a
**natural fraction (0–1)**. The **read/display layer** multiplies by 100 when the unit is `%`
(one place, unit-driven) — **nothing is hardcoded into KPI formulas**. Any value currently stored
on a **0–100** scale for a `%` quantity is a **data-quality defect** to be corrected to a fraction.

This **supersedes** the earlier "wrap 48 proportion formulas with `× 100`" approach — **PR #602 is
scrapped** (baking presentation into computation is fragile and mixes concerns). The unit already
says "present as a percent"; the number should be the pure computed ratio.

**Invariant this establishes:** `unit = '%'  ⇒  stored value is a fraction (0–1)`. Once that holds
uniformly, the display rule (`× 100` for `%`) is unambiguous and correct everywhere — which is the
fix for the bug where the PPA report showed "Renewable 0.06" for 6%.

## Ownership

- **#4 — display formatter.** Own the single unit-driven `× 100` scaling. **Correction (#4 grep,
  2026-09-25): it is NOT gold-only** — only `lib/ai/**` reads `gold.fact_kpi`; the webapp UI
  (review-kpi, BSC, KPI / entry screens) reads value+unit from silver / `data_entries`, never gold.
  So the source of truth is a **shared TS formatter** that webapp + AI + exports all call, with a
  **gold SQL mirror for Power BI** (the only non-TS consumer). Built inert as `lib/units/format.ts`
  (PR #612, 11 tests); not wired to any read path until the invariant below holds. **Unit-detection
  is EXACT `unit == '%'`** — the rate units `% per unit GDP` and `% per 1000 persons`, and `Ratio`
  (133 rows, shown as-is), must **never** be ×100'd, in the formatter *or* the cleanup.
- **#2 / #8 — data cleanup.** Correct Populations A + B below in `country_context` / `data_entries`
  so every `%` quantity is a fraction. Git-first; applied on Eugene's direct in-session word.
- **#3 (calculator).** Formulas already output natural ratios (0–1) — **no formula change needed**;
  PR #602 scrapped; new proportion KPIs stay ratio-only (never `× 100` in the formula). The Step-4
  full recompute regenerates KPI values from the cleaned base.

---

## Population A — percentage stats stored as 0–100 (systematic)

Country-context national stats (in `country_context`, not `data_entries`), entered as percent
(0–100). **Action: ÷ 100 to fractions.** (The other context measures — Population, GDP, Households,
Land Area — are genuine counts, correctly not fractions; leave them.)

| measure_def_id | name | median | max |
|---|---|---|---|
| 8 | Access to Electricity | 100 | 100 |
| 4 | Urban Population | 39 | 100 |
| 5 | Rural Population | 32.6 | 87 |
| 11 | Unemployment Rate | 6.5 | 16 |
| 10 | Inflation Rate | 7.0 | 14 |

---

## Population B — mis-scaled source rows (bounded proportions computing > 1)

These KPIs are proportions bounded ≤ 1 by construction, yet compute > 1 for specific
`(utility, period)` — so a **source input for that row is on the wrong scale** (or a unit error).
Each is a data-entry to correct at source; the ratio then falls back ≤ 1. (Values shown are the
current computed KPI value from `gold.fact_kpi`.)

**Generator Capacity Factor** (= generated ÷ (rated_capacity × hours); ≤ 1)
- CPUC 2025-09-30 = **157.41** · NUC 2020-06-30 = 13.88 · PUC 2024-09-30 = 11.07 · TEC 2024-12-31 = 3.49 · YSPSC 2025-09-30 = 1.52

**Station Usage / Station Auxiliaries** (= aux_usage ÷ generated; ≤ 1)
- NUC 2023-06-30 = **8457.49** · KUA 2022-09-30 = 8.28 · MEC 2023-09-30 = 4.87 · MEC 2022-09-30 = 3.34 · MEC 2024-09-30 = 1.41

**Transformer Utilization Factor** (= avg_load ÷ total_capacity; ≤ 1)
- UNELCO 2025-01-31 = **148.29** · TEC 2022-12-31 = 34.14 · TEC 2025-12-31 = 25.89 · NUC 2020-06-30 = 6.49 · PUB 2025-12-31 = 2.51 · UNELCO 2024-01-31 = 1.56

**Generator Forced Outage Indicator** (≤ 1)
- PUC 2022-09-30 = 4.70 · PUC 2023-09-30 = 4.38 · SP 2023-12-31 = 3.24 · SP 2022-12-31 = 3.06 · SP 2025-12-31 = 3.05 · PUC 2025-09-30 = 2.03 · PUC 2024-09-30 = 1.96 · EFL 2023-12-31 = 1.69 · EFL 2022-12-31 = 1.17 · TAU 2023-06-30 = 1.13

**Transmission Network Losses** (≤ 1)
- MEC 2024-09-30 = 3.49 · MEC 2022-09-30 = 1.31 · MEC 2023-09-30 = 1.24 · KUA 2022-09-30 = 1.12

**Patterns to check first:** **MEC** recurs across Station Usage + Transmission Losses (its
generation / loss inputs look mis-scaled); **NUC 2023 Station Usage = 8457** and **CPUC Capacity
Factor = 157** are extreme unit errors; **PUC / SP** dominate the outage indicator. Tracing each row
to the exact offending *input* measure (not just the KPI) is the next drill if wanted — flag #3.

---

### Population B — root-cause drill (#3, 2026-09-25, read-only)

Tracing each anomalous row to its input `value_numeric` splits Population B into **three** root
causes — one of which is a **calculator/formula** issue, not a data defect:

**(B1) DATA — `electricity_generated` (measure 321) entered in kWh not MWh (÷1000).** The flat
input aggregate reproduces the gold value exactly, so this is solid.
- Capacity Factor: CPUC `rp241` 2025-09-30 **9,092,968 → 9,093** (CF 157→0.157); NUC 2020-06-30
  3,041,434 → 3,041; PUC 2024-09-30 775,628 → 776; TEC 2024-12-31 152,030 → 152; YSPSC 2025-09-30
  116,289 → 116.

**(B2) DATA — `station_auxilliary_usage` (measure 430) grossly inflated** (it *exceeds* generation,
impossible; aux is ~1–5% of gen). One fix clears **both** Station Usage and Transmission Losses for
that row.
- NUC 2023-06-30 aux=**36,531,044** vs gen 4,319; MEC 2023=321,166 / 2022=212,000 / 2024=93,996 vs
  gen ~65,889; KUA 2022=54,083 vs gen 6,530. **MEC recurs → systematic MEC aux error.** Looks
  ×100–1000 too big; exact factor needs the source doc.

**(B3) NOT DATA — Forced Outage Indicator is a formula/grain issue → #3 (calculator), not cleanup.**
`unplanned_downtime_hours` is summed across units (e.g. PUC 41,138 h over 10 units) but divided by a
single `hours_in_period` (8760); the capacity-weighting cancels instead of dividing by the units'
actual operating hours. 41,138/8760 = 4.70 — far too high.

**Correct denominators (ruled — #8, unit-lifecycle spec / §4.6.1) — TWO dimensionally-distinct
stint-derived measures, NOT interchangeable:**
- **Capacity Factor** (energy numerator, MWh) → **capacity-hours** = Σ over stints of
  (rated_capacity × stint-hours ∩ period), units **MW·h**. Energy ÷ MW·h is dimensionless ✓.
- **Outage indicators** (forced / planned; downtime-hours numerator, h) → **unit-hours** = Σ over
  stints of (stint-hours ∩ period), units **h**, **UNWEIGHTED**. Hours ÷ h ✓. Hours ÷ MW·h is *not*
  a rate — never mix. (A capacity-weighted outage KPI would be a *different* KPI whose numerator is
  also cap-weighted: Σ cap×downtime ÷ Σ cap×hours.)

Each unit contributes only its **actual operating hours** (a unit commissioned mid-year / deactivated
≠ full period); `n_units × flat hours_in_period` (e.g. 10×8760) is only the naive all-active special
case and **understates** the indicator for churn utilities. So PUC stays 41,138 ÷ Σ(unit-hours). The
§4.6.1 fix needs **both** stint-derived measures (or one stint roster feeding two aggregations), each
ratio bound to its dimensionally-matching one. **Removed from data-cleanup scope; #3 owns the fix
(Capacity / Forced / Planned generator ratios); #8 reviews BOTH denominator expressions before it
lands.**

**(B4) PENDING — Transformer Utilization Factor:** the flat input aggregate (load 73.74 / cap 49.73 =
1.48) diverges from the engine's value (148.29) by ×100, so the engine resolves these inputs
differently than a naive sum. Needs the engine's actual resolved values to pin the culprit — #3 to
drill engine-side.

**So Population B data-cleanup (#2/#8) = (B1) `electricity_generated` ÷1000 [5 rows] + (B2)
`station_auxilliary_usage` source-fix [MEC/NUC/KUA].** (B3) is calculator, (B4) pending.

## Population C — unit mislabel (not a scale issue)

**Duty on Fuel and Lube Oil** carries unit `%` but holds a money amount (max ≈ 234,000,000). Fix
the **unit** (it is not a percentage), not the scale.

---

## Population D — entry-side (go-forward defect prevention) — #2 / #11

Storing fractions means `%` entry fields must **accept human percent and store the fraction** (a
`type 6` % field: user types "6" → store `0.06`). Without this, every new `%` entry after cleanup
**re-introduces** the 0–100 defect. #2 / #11 domain (raised by #4 per Eugene, 2026-09-25).

**Recommended UX — storage-only:** the user still types "6" and sees "6" on edit; only the *stored*
value becomes `0.06`. Per #8 that is **no USER-IMPACT journey change → no ledger row**; only if users
must type fractions does it need a row. Whoever lands it (#2 / #11) decides; storage-only is the clean
default.

**⚠ SEQUENCING HAZARD (#8 / #2 apply-plan rule):** the entry-form switch and the data cleanup
(Pop A/B) **must apply in the same window** — or data entry is paused for the gap. Otherwise:
form-first → fraction entries land among old 0–100 rows = a **mixed-scale cohort** that #8's Pop-A
uniformity gate will (correctly) refuse to blanket-÷100; cleanup-first → every `%` entry in the gap
re-introduces the defect. #8's uniformity check runs **at apply time** as the tripwire, not before.

---

## Sequence

1. **#4** — shared TS formatter (`lib/units/format.ts`, PR #612, inert) + gold SQL mirror for Power
   BI (follow-up, gated on cleanup + `gold.fact_kpi.actual_value` varchar→numeric).
2. **#2 / #11** — entry-form switch (store fraction), **same window as step 3** (or pause entry).
3. **#2 / #8** — clean Populations A + B (fix C's unit) so every `%` value is a fraction — on
   Eugene's direct in-session go; the uniformity gate runs **at apply time**.
4. The **Step-4 full recompute** ([kpi-target-actual-contract §5](kpi-target-actual-contract.md))
   regenerates KPI values from the cleaned base; `%` reads correctly via the formatter. #3's
   generator-ratio denominator fix (B3) lands with this.
5. Once live on a consistent scale, ping #16 to re-enable the AI's `%` display (dropped as a stopgap).

_Author: #3 (calculator). Data grounded against p2 read-only, 2026-09-25._
