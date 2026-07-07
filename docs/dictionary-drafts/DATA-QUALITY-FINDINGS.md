# Data-quality findings from the dictionary drafting pass (2026-07-07)

Surfaced while AI-drafting the 245 dictionary definitions. Ordered by severity.
Items 1–4 can produce **wrong published KPI values** and should be verified before the next report cycle.

## Formula issues (likely bugs)

1. **`Total Employees Male` (KPI id 61)** — formula omits `human_resource_employees_male`;
   the female counterpart includes its HR term. Male totals (and any gender ratios built on them)
   are likely understated.
2. **`Planned SAIDI` / `Planned SAIFI`** — formulas divide by *customers affected* rather than
   *total customers served*. This is methodologically non-standard (CAIDI-like) and overstates the
   indices relative to the industry definition used in the PPA Benchmarking Report.
3. **`Generator Availability Factor`** — formula has unbalanced parentheses; the KPI worker's
   evaluator will fail on it. Check `kpi_calculation_attempts` for repeated failures.
4. **`Engine Oil Consumption`** — formula appears inverted relative to its kWh/litre unit
   (`oil_for_generators / electricity_generated` yields litres per kWh, not kWh per litre).

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
