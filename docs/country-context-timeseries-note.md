# Country context — load-path trace + the time-series/sync gap (findings for #4)

**Status:** FINDINGS (2026-08-17) · **From:** #2/jolly (migration) · **For:** #4 (schema) · Eugene-flagged
· Related: **ADR 0004 (effective-dated dimensions)**

Eugene: some country data must be **updated annually by the BMO**, needs to be a **time series**, and
**synchronised with the submissions data**. Tracing how country context loads today shows why the
current model can't do that — it lives in two disconnected places, neither period-aware.

## Current state — three touchpoints, split-brained

**1. `country_context` table — the BMO reference**
- Maintained via `app/settings/country-context` (`service.ts`): **Create + Delete only, no Update/upsert**.
- Keyed by `(country_id, dl_def_id=measure)` + `value` + provenance (`source_date/doc/url`). **No period, no utility.**
- Read by `factCountryContextData` (+ per-measure `factPopulation`, `factGdpPerCapita`, …) joined to each
  utility via `utility.country_id`. **Time-invariant: one value per country per measure, shown against every period.**
  The read `reduce` assumes a single row per `(country, measure)` — multiple rows resolve arbitrarily.

**2. p1 migration writes to `data_entries`, NOT `country_context`**
- `app/migration/service.ts` (~L788) fetches legacy `/countryContext`, maps p1 `dl_def_id → p2 measure`, and
  **inserts into `data_entries`** at `(report_period_id, measure)` grain with **`utility_id`/`country_id`/
  `service_area_id`/`unit_id` = null, all 10 dimensions = "All"**. Since `report_periods` are utility-scoped,
  this materialises country context **per utility-period**.

**3. Carry-forward backfill** (`countryContextBackfill`, ~L2524)
- Copies a utility's country-context `data_entries` from its **most recent prior period** into a new period
  lacking them — a workaround for country context having no time dimension of its own.

## The disconnect (what breaks Eugene's requirement)
- **Two stores, not synced:** migration fills `data_entries`; `factCountryContextData` reads the
  `country_context` table. They can diverge.
- **`country_context` has no period/year key** — cannot hold "Population FY2023" vs "FY2024" as distinct
  figures (only `source_date` for provenance).
- **BMO UI is create/delete, no update** — annual refresh = appended rows with no versioning; the read path
  can't disambiguate multiple rows per `(country, measure)`.

## Asks for #4 to work through
1. **Give country context a time dimension** — add an effective-date/period key to `country_context`, or
   unify onto `data_entries` at **country grain** (`country_id` set, `utility_id` null) carrying the period.
   **Reuse ADR 0004 (effective-dated dimensions).**
2. **Resolve the split-brain** — one source of truth feeding reads, not two bridged by a carry-forward.
3. **BMO maintenance:** upsert + annual versioning (settings UI needs Update + a period selector).
4. **Sync with submissions:** a period's country context should align with the report periods being submitted.

## Migration-side implication (my stream)
- For the country-context measures, the established pattern uses **no `utility_id`** (data_entries, dims = All,
  `report_period_id` = the utility's period).
- **I'm holding the country-context slice of the migration** until #4 lands the time-series model — migrating
  now would load into a representation that's about to change. Main `data_entries` migration proceeds as normal.
