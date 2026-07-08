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
   — **SAIFI RESOLVED on dev 2026-07-08** (user confirmed customers-served data exists — it was
   under legacy input 153): `scripts/migrate-customers-served.ts` deduped 153's rows (248 → 105,
   preserving All GEN scope tags) into input 1501 and activated it; `scripts/fix-saifi-formulas.ts`
   re-pointed **Planned SAIFI (124)** and authored **Unplanned SAIFI (126)** as
   `events / electricity_customers_metered_connections` (bindings carry the full
   provider=21/type=30/source=40 triple the engine's matcher requires), and re-pointed the
   **Planned SAIDI (123)** denominator as prep. End-to-end verified via `scripts/verify-saifi.ts`
   (engine output matches hand computation, e.g. Majuro Grid 25/5,097). **Expect SAIFI values to
   drop vs previously published** — customers-served ≥ customers-affected. **SAIDI still cannot
   compute**: the duration numerators (1802/1805) have zero data ever collected and are inactive —
   either restart collecting customer-minutes or park the SAIDI KPIs. `Unplanned SAIDI` (125)
   still has no formula. Run both scripts on prod after re-checking with the inspect scripts.
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
16. **Scopes hold blank and conflicting duplicate rows, and the engine picked rows blindly** —
    e.g. one (period, grid, resource) scope held 75 rows for Electricity Generated / Oil for
    Generators: mostly blank legacy copies plus **two conflicting Electricity Generated values
    (147.945 and 63)**. The KPI worker's single-value path took `candidates[0]` with no ordering,
    so a blank copy could win and fail the KPI as "missing-input" nondeterministically.
    — **ENGINE FIXED 2026-07-08** (`resolveInputs.ts`: rows ordered newest-first; the single-value
    path now takes the first candidate that actually carries a number). The conflicting-value
    pairs themselves still need a data cleanup pass (ties into the total-vs-detail validation
    opportunity in the KPI guide follow-ups, item 19).

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
