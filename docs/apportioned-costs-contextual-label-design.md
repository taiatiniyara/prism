# Apportioned-costs contextual label — electricity-only financials for multi-service utilities

**Status:** proposed (2026-08-16) · **Author:** #2/jolly (migration) · **For assessment by:** #13
(sector/terminology), #11 (entry UI), #4 (measure schema + Silver views)

## 1. The problem

PRISM collects **electricity** financials only. But some utilities also run **water and/or
sanitation** (e.g. ASPA does all three). For those multi-service utilities, a financial figure
(staff costs, etc.) must be entered as the **electricity-apportioned share**, not the whole-utility
total. A small subset of financial measures are subject to this.

Eugene originally signalled these by prefixing their labels with **`"Apportioned Costs:"`**. But
that prefix is **only meaningful for multi-service utilities** — an electricity-only utility should
just see the plain label and enter the figure directly.

## 2. Decision — don't store the prefix; apply it contextually

Storing `"Apportioned Costs:"` in the label is presentation baked into data. Instead:

1. **Stored label stays clean** in `measure_definitions` (e.g. `"Staff Costs"`).
2. **`is_apportionable` flag** (boolean on the measure) marks the ~5 financial measures subject to
   apportionment. *(Eugene's incoming measure-definitions file already carries this column with the
   prefix stripped; migration loads the flag — see §5.)*
3. **Contextual prefix at the presentation layer:** for a given utility, **if it is multi-service**
   (provides water and/or sanitation), prepend `"Apportioned Costs: "` to the label of
   `is_apportionable` measures. Electricity-only utilities see the plain label.

The stored **value is unchanged** (it's the electricity figure either way) and `is_approved` is
unaffected — the prefix is purely an on-screen instruction/label.

## 3. The "is this utility multi-service?" signal — key question for #13

Today the signal is `service_areas.provides_water` / `provides_sanitation` (a utility is
multi-service if any of its service areas provides water/sanitation). Currently **only two**
utilities qualify: **ASPA** (util 2 — water + sanitation) and **NUC** (util 16 — water).

**But** ADR-0003 flags `provides_electricity/water/sanitation` as a "second source of truth"
**likely to be retired** in favour of the sector model (`service_areas.sector_id` /
`organisation_sector`). So this contextual prefix should ideally read the **sector model**, not the
raw booleans — or read the booleans now and migrate with the rest. **#13 to decide where
"multi-service" lives**, so we don't build on a column they're removing.

## 4. This is a sector-driven contextual label → #13's terminology layer

`"Apportioned Costs:"` is exactly a **sector-context label** (the electricity framing of a financial
measure for a multi-service org). It belongs in the terminology resolver (`lib/terminology`)
alongside the Grid / Supply Zone / Catchment relabels — the same `useTerm` / resolver pattern,
keyed on the utility's sector mix **and** the measure's `is_apportionable` flag. Applying it there
means the entry UI, Silver display views, exports, AI dictionary, and Power BI all stay consistent.

## 5. Scope & rules

- Applies to **`is_apportionable` measures only** (~5 financial measures).
- **Multi-service = provides water OR sanitation** (electricity-only if neither).
- Prefix is **display-only** (label + exports) — never stored, never affects the value or approval.
- Migration (me): load `is_apportionable` from Eugene's measure file; the labels arrive
  **already stripped** of the prefix, so nothing to remove server-side — just carry the flag.
- Data state today: **5** `is_apportionable` measures (Eugene's file); **2** multi-service utilities
  (ASPA util 2, NUC util 16).

## 6. Ownership

| Piece | Owner |
|---|---|
| `is_apportionable` column on `measure_definitions`; expose it + apply the prefix in Silver display views | **#4** |
| Where "multi-service" lives (sector model vs `provides_*`); fold the prefix into the terminology layer | **#13** |
| Render the contextual prefix in the entry UI (label and/or help text) | **#11** |
| Load `is_apportionable` from the measure-definitions file (prefix already stripped) | **#2/jolly (me)** |

## 7. Open questions (for the assessing agents)

1. **#13:** multi-service signal — `provides_*` now, or gate on the sector model from the start?
2. **#11:** is the prefix a **label** change, or better as **help/instruction text** on the cell
   (so the stored label everywhere stays clean and only the entry hint changes)?
3. **General:** are any measures apportionable to **water/sanitation** too (not just electricity)?
   Assumed electricity-only per PRISM's scope — confirm.
4. **#4:** `is_apportionable` as a plain boolean, or does apportionment need a richer shape later
   (e.g. an apportionment basis/method)? Boolean is the v1 recommendation.
