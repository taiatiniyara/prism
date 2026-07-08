# Data-quality findings from the dictionary drafting pass (2026-07-07)

Surfaced while AI-drafting the 245 dictionary definitions. Ordered by severity.
Items 1–4 can produce **wrong published KPI values** and should be verified before the next report cycle.

> **Status update 2026-07-08:** items 1, 3, 4 (and new item 13) FIXED on the dev
> DB via `scripts/fix-formula-bugs.ts` — guarded updates, safe to re-run, and
> **must also be run against prod** (definitions are data; deploys don't sync
> them). Historical KPI values recompute when the gold layer re-applies stored
> formulas (Q2 design) or on the next data-entry touch per scope. Item 2 is
> BLOCKED on a domain decision — see below.

## Formula issues (likely bugs)

1. **`Total Employees Male` (KPI id 61)** — formula omits `human_resource_employees_male`;
   the female counterpart includes its HR term. Male totals (and any gender ratios built on them)
   are likely understated. — **FIXED on dev 2026-07-08** (term + binding for input 1414 added).
2. **`Planned SAIDI` / `Planned SAIFI`** — formulas divide by *customers affected* rather than
   *total customers served*. This is methodologically non-standard (CAIDI-like) and overstates the
   indices relative to the industry definition used in the PPA Benchmarking Report.
   — **BLOCKED (2026-07-08): there is NO active "total customers served" input** (only inactive
   legacy ones: 153 `electricitycustomers`, 1501 `electricity_customers_metered_connections`,
   95 org-level total). Options: (a) (re)activate a customers-served input and re-point the
   denominators — standard-compliant, but adds a data-collection requirement; (b) keep the
   formulas and rename/redocument the KPIs as CAIDI-like. Note also that `Unplanned SAIDI` (125)
   and `Unplanned SAIFI` (126) have **no formulas at all**, and the Planned SAIDI numerator input
   1802 (`total_planned_interruptions_customer_duration`) is **inactive** — verify duration data
   is still being collected before deciding.
3. **`Generator Availability Factor`** — formula has unbalanced parentheses; the KPI worker's
   evaluator will fail on it. Check `kpi_calculation_attempts` for repeated failures.
   — **FIXED on dev 2026-07-08** (`(hours − (planned + unplanned)) / hours`, plain ratio per the
   dominant %-KPI convention — see item 14).
4. **`Engine Oil Consumption`** — formula appears inverted relative to its kWh/litre unit
   (`oil_for_generators / electricity_generated` yields litres per kWh, not kWh per litre).
   — **FIXED on dev 2026-07-08** (inverted to `electricity_generated / oil_for_generators`; the
   original was also missing a closing parenthesis).

## New findings (2026-07-08, while fixing the above)

13. **`Transmission and Distribution Labor Costs` (KPI id 31)** — formula was missing its `/`
    operator entirely (`( staff_costs_transmission + staff_costs_distribution ) service_total_costs`),
    so it could never evaluate. — **FIXED on dev 2026-07-08** (slash restored, matching siblings
    26–28). Note it shares the "reuses O&M-style formula" question of item 6 (labor vs O&M costs).
14. **`× 100` convention is inconsistent across %-unit KPIs** — 28 active %-KPIs store plain
    ratios, but `Employees Male %` (64) and `Employees Female %` (65) multiply by 100. Whatever
    the display layer assumes, two of these are off by a factor of 100. Decide one convention
    and normalise.
15. **Interruption *duration* inputs are inactive** (1802 planned / 1805 unplanned / 1808 total
    `…_customer_duration`) while their event/affected counterparts are active — yet 1802 is the
    numerator of the active Planned SAIDI. If duration data is no longer collected, Planned SAIDI
    cannot compute at all.

## Needs developer verification (may be intentional)

5. **`IPP Generation` and `Renewable Energy to Grid`** — formulas read as
   `electricity_generated / electricity_generated`. Possibly correct via formula-input dimension
   scoping (numerator filtered to IPP provider / renewable source), but verify the scoping actually
   distinguishes numerator from denominator.
6. **`Generation Labor Costs` (KPI id 30)** — reuses the Generation O&M Costs formula verbatim.
   Confirm whether a labour-specific formula was intended.
7. **`Lost Time Injury Duration Rate` (KPI id 94)** — unit says "Incidents/Million Hours" but the
   formula (`hours_lost * 8 / employees_total`) produces a per-employee duration. Unit and formula
   cannot both be right.

## Unit / validation metadata errors

8. **`Electricity Demand Average Load` and `Peak Load` inputs** — unit stored as MWh; load is
   conventionally MW.
9. **`access_to_electricity` input** — unit is "%" but valid range is 0–1 (decimal proportion).
   Unit and validation disagree.
10. **`rural_population` / `urban_population` inputs** — valid range min = max = 1 (seed debris);
    range validation is meaningless as stored.

## Housekeeping

11. **404 inactive input definitions** (of 505 total) look like legacy-migration leftovers.
    Exclude from all AI-facing surfaces (gold layer already will); consider archiving.
12. **KPI `100 kWh` (id 130)** and the other tariff-structure entries have empty formulas —
    values are compiled from published tariff schedules rather than calculated; the drafts document
    this, but confirm the ingestion path.
