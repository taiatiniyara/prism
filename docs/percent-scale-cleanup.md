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
