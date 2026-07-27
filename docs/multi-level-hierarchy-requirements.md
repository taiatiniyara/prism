# Multi-level data hierarchy — agreed grain convention + requirements (RULED)

**From:** stream #8 (PRISM multi-level data hier) · **To:** #2 (owner of all shared-table DDL), #3 (`kpi_actual`), #12 (RLS), #14 (data updates)
**Status:** **RULED by Eugene 2026-07-27** — the "hybrid" convention below is the agreed
`data_entries` grain model, endorsed independently by #8 and #4 (schema-for-AI assessment).
**Supersedes:** this doc's earlier "Option A" exactly-one-anchor design (ratified 2026-07-26,
superseded before any DDL), AND the medallion spec §1.4 *target* of making grain columns NOT NULL
via "All areas"-type sentinel members (rejected — see §2.4). #2: please amend
`schema-redesign-medallion.md` §1.4/§1.5 target notes accordingly.
**History:** replaces PRISM 1's virtual-generator pattern. Terminology per PR #68
(`unit_id`/`units`; dims provider/category/technology/asset).

---

## 1. The ruled convention in one paragraph

`data_entries` keeps its **as-built nullable grain chain** — `unit_id`, `power_station_id`,
`service_area_id`, `utility_id`, `country_id` — filled **from the row's collection level up to the
coarsest applicable level, and NULL below it** (finer levels empty). **A row's level = its deepest
(finest) non-NULL grain column.** Nothing pretend ever holds data: no sentinel rows, no "All
areas"-type members in grain columns — an empty finer column truthfully means "this fact lives
above that level". Aggregates ("all countries", cohort benchmarks) are computed rollups, never
stored addresses. `kpi_actual` uses this address model **literally** (per #3's spec §4.4).

Examples (grain columns only):

| Fact | unit | station | area | utility | country |
|---|---|---|---|---|---|
| Genset #2 generation | ✔ | ✔ | ✔ | ✔ | ✔ |
| Kinoya station auxiliaries | — | ✔ | ✔ | ✔ | ✔ |
| Viti Levu grid losses | — | — | ✔ | ✔ | ✔ |
| EFL total revenue | — | — | — | ✔ | ✔ |
| Fiji GDP | — | — | — | — | ✔ |

Dims vs grain — the split philosophy is deliberate (per #4): the 10 dimension columns **classify**
(NOT NULL, explicit **All** member — a real bucket), grain columns **locate** in a physical
hierarchy (NULL above… means truthfully absent). Do not "unify" them.

## 2. Requirements on the grain columns

1. **Chain-consistency validation** (replaces the old exactly-one CHECK): a row's filled grain
   columns must match **real parentage** — a unit row's station/area/utility/country must equal
   that unit's actual FK chain; an area row's utility/country must equal the area's owner.
   Enforced at the write path (trigger or the shared writer) — the denormalized chain must never
   contradict the entity tables.
2. **Derived `grain_level`** (`'unit'|'station'|'area'|'utility'|'country'`): a **generated**
   column (or Silver-view field, #2's choice) computed from which columns are filled. Generated ≠
   the "dual-encoding disease" §1.5 forbids — it cannot disagree with the address. Purpose:
   humans/AI write `WHERE grain_level='utility'` instead of NULL-pattern logic they will get wrong.
   `kpi_actual` carries the same.
3. **One grain per measure per period:** within a report period, a measure's rows sit at exactly
   one grain level (the measure's declared `agg_level`, writer-validated per medallion §1.5) —
   otherwise `WHERE country_id=X` double-counts. **Per period**, not global: §1.6 mixed-grain
   measures (e.g. lump-sum→split revenue) legitimately change grain across periods.
4. **No sentinel/aggregate rows as grain values — ever** (the clause that rejects the old spec
   target): no "All areas" member, no "All Countries" (id 100000) or "Others" sub-region anchors,
   no benchmarking-group addressing. M49 note: real countries are codes ≤999, sentinels ≥100000 —
   a `country_id < 1000` CHECK suffices at level 5.
5. **Unique address:** as built — `uniq_entry_address` UNIQUE **NULLS NOT DISTINCT** over
   period + measure + 5 grain columns + 10 dims. Keep it; it is what makes NULL-above-level rows
   deduplicate.
6. **Drop `subregion_id` and `region` from `data_entries`** (small subtractive DDL): both are
   determined by `country_id`, are excluded from the unique address, and are "never entry levels"
   (spec §1.5) — keeping them writable is drift risk. Derive them in Silver/gold from `country_id`.
7. **`country_context` fold-or-keep (flag, not blocker):** unchanged — #8 will bring a
   recommendation once country-grain entry is live; not first-DDL-pass.

## 3. Backfill: promoting entries off the virtual entities

Unchanged in intent; the promotion now writes **the chain**, not a single anchor. The virtual rows
say where each entry belongs (`units.power_station_id` / `.service_area_id`;
`service_areas.utility_id`; `organisations.country_id`):

| Today's anchor | Becomes (chain filled) | Rule |
|---|---|---|
| virtual `unit` **with** `power_station_id` | station+area+utility+country; unit NULL | station-level data parked on a station virtual |
| virtual `unit` without station | area+utility+country | grid-level data parked on a grid virtual |
| virtual `service_area` | utility+country; area NULL | org-level data parked on a virtual area |
| org-level rows whose measure's `agg_level` = country | country only; utility NULL | country-level data (see §4 ownership note) |

⚠ Verify the virtual→level convention against actual rows before trusting it (e.g.
`SELECT … WHERE is_virtual GROUP BY agg_level_id`); one transaction; per-level row counts
before/after; nothing dropped. Expect and dedupe legacy duplicate addresses first (the old
`uniq_entry` was never unique). After no entries reference them: soft-delete virtual
`units`/`service_areas`; drop `is_virtual` only once onboarding/import paths stop creating them.

## 4. RLS (#12) — native but with one sharp edge

`utility_id` on every owned row **is** the tenant column — no extra column needed (improves on the
old Option A §4). Two obligations:
- **Policy shape:** country-level facts are shared (`utility_id IS NULL`), so the policy is
  `utility_id = current_setting(…) OR utility_id IS NULL` (or a separate read policy for shared
  rows). #12 owns the final shape.
- **Leak guarantee:** no utility-owned fact may ever be written with NULL `utility_id` — that's a
  cross-tenant leak. The §2.1 chain-consistency validation is also the enforcement point here:
  every sub-country row must carry its real `utility_id`.

## 5. Interaction with the submissions rename

Unchanged: `report_periods` → `submissions` + `period_id` FK to the canonical `period` dim
(reconciled time-series design, Eugene 2026-07-24); lands with #2's rework as one coordinated
change. Grain (WHERE) and period (WHEN) stay orthogonal.

## 6. Out of scope for #2 (stays with other streams)

- `kpi_actual` build — #3; **uses this address model verbatim** (incl. `grain_level`); its rollup
  rows are the one place coarse-grain computed values live.
- App-layer query changes (entry screens per declared grain; removing `is_virtual` filters) —
  #8/#11 after schema lands.
- RLS policy DDL — #12 (per §4).
- `kpi_target` / `kpi_limit` — #5 / #3 per board notes.
