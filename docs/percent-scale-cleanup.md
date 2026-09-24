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

- **#4 — gold / display layer.** Own the single unit-driven `× 100` formatter at the shared read
  surface (gold is the read surface for Power BI + AI + exports). One enforcement point so no
  consumer re-derives scale and shows `0.06%`. Also fold in a `ratio` unit that displays as-is.
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
single `hours_in_period` (8760); the capacity-weighting cancels instead of giving
Σ(unplanned)/Σ(unit-hours). 41,138/8760 = 4.70 but the intended value is 41,138/(10×8760) = 0.47.
This is the known capacity-hours denominator issue (calculator-engine-spec §4.6.1). **Removed from
the data-cleanup scope; #3 owns it.**

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

## Sequence

1. **#4** builds the unit-driven display formatter at the gold/read layer (+ `ratio` unit).
2. **#2 / #8** clean Populations A + B (and fix C's unit) so every `%` value is a fraction — on
   Eugene's direct in-session go per the DB-apply rule.
3. The **Step-4 full recompute** ([kpi-target-actual-contract §5](kpi-target-actual-contract.md))
   regenerates KPI values from the cleaned base; `%` values then read correctly via the formatter.
4. Once live on a consistent scale, ping #16 to re-enable the AI's `%` display (dropped as a stopgap).

_Author: #3 (calculator). Data grounded against p2 read-only, 2026-09-25._
