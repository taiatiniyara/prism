# Multi-level data hierarchy — agreed grain convention + requirements (RULED)

**From:** stream #8 (PRISM multi-level data hier) · **To:** #2 (owner of all shared-table DDL), #3 (`kpi_actual`), #12 (RLS), #14 (data updates)
**Status:** **RULED by Eugene 2026-07-27** — the "hybrid" convention below is the agreed
`data_entries` grain model, endorsed independently by #8 and #4 (schema-for-AI assessment).
**Supersedes:** this doc's earlier "Option A" exactly-one-anchor design (ratified 2026-07-26,
superseded before any DDL), AND the medallion spec §1.4 *target* of making grain columns NOT NULL
via "All areas"-type sentinel members (rejected — see §2.4). #2: please amend
`schema-redesign-medallion.md` §1.4/§1.5 target notes accordingly.
**History:** replaces PRISM 1's virtual-generator pattern. Terminology per PR #68
(`unit_id`/`units`; dims provider/category/technology/asset_class — the asset dim renamed
`asset_class_id` and the declared level renamed `agg_level`→`strata` by PR #78, 2026-07-28).

---

## 1. The ruled convention in one paragraph

`data_entries` keeps its **as-built nullable grain chain** — `unit_id`, `power_station_id`,
`service_area_id`, `utility_id`, `country_id` — filled **from the row's collection level up to the
coarsest applicable level, and NULL below it** (finer levels empty). **A row's level = its deepest
(finest) non-NULL grain column.** Nothing pretend ever holds data: no sentinel rows, no "All
areas"-type members in grain columns — an empty finer column truthfully means "this fact lives
above that level". Aggregates ("all countries", cohort benchmarks) are computed rollups, never
stored addresses. `kpi_actual` uses this address model **literally** (per #3's spec §4.4).

### 1.1 The rulebook (plain-language, Eugene-agreed 2026-07-27/28)

**Address (grain) columns LOCATE; dimension columns CLASSIFY. The two axes deliberately follow
opposite "All" conventions:**

| | Grain (unit/station/area/utility/country) | The 10 dimensions |
|---|---|---|
| "Everything" is | **computed** (a rollup, never stored) | **stored** (the explicit **All** member) |
| Empty means | "this fact lives above that level" (truthful) | never empty — NOT NULL by design |
| Sentinel rows/members | **banned** — and deleted from the DB 2026-07-27 | **required** — All is a real bucket ("not split by this") |

The seven rules, in one list:
1. Grain columns hold **real entities or nothing**; filled from the row's level up; level = deepest
   filled; zero sentinel rows exist to violate this.
2. The 10 dims are **never blank** — explicit member always; **All = "not split by this dimension"**.
3. **One value** per row (numeric/boolean/text/option — the measure's type decides which).
4. **One address, one row** (unique over period + measure + grain + all 10 dims, NULLS NOT DISTINCT).
5. **One grain per measure per period** (mixed grain across periods allowed, §1.6 medallion).
6. **Chain consistency** — filled grain columns must match the real hierarchy (#2's shared writer).
7. **Aggregates across grain are computed** in gold/`kpi_actual` — never stored entries.

**Unit-row dimension consistency (rule 6's dimension twin):** on a **unit-anchored row**, the four
energy dims (provider / category / technology / asset class) must equal that unit's *real* taxonomy — a
diesel genset's generation row says Diesel, never All. "All" on those four is legitimate only at
coarser grain, or where the dimension doesn't apply. Enforce in the same shared writer as rule 6.
*Source-of-truth — **RATIFIED by Eugene 2026-07-28 (final, here in #8's session)**:* on `units`,
**`technology_id` is the sole stored taxonomy leaf**; category = parent(technology) and
asset class = grandparent(technology), **derived through the taxonomy, never stored on the unit**
(same anti-dual-encoding philosophy as `grain_level`). The mispopulated `units.category_id` and
stale `type_id` are already dropped (935847b, Eugene-instructed). The writer therefore validates
provider + technology **directly** against the unit and category + asset class **via technology's
ancestry** — full 4-of-4 enforcement, no pluggable gap remaining.
*Related flag:* asset-class member **1035 "Virtual"** exists in the managed list — once §3 retires
the virtual units, no row should legitimately classify as asset_class=Virtual; deactivate the member in the
same pass.

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

**Utility obligation counts only human-answerable shells (Eugene, 2026-08-25):** the
utility-facing "requested" count = shells WHERE `is_calculated = false AND is_system_generated =
false AND is_context_fed = false`. Engine-filled, system-generated, and context-fed shells are
real addresses in the relevance balance but are **never part of what a utility is asked to
answer** — they must not inflate requested counts or completeness denominators. Corollary: two
denominators, never mixed — **utility completeness** (answered / human-answerable requested) is a
*performance* metric; **calculated/context shell fill-rate** is an *engine/pipeline health*
metric. The generator and the scorecard compute the utility count identically, from this rule.

**Service-area capability declaration — SPANS RULED FINAL (Eugene, 2026-08-25):** contextual
shells (e.g. the Transmission slice) are gated on **declared** capability, never inferred from
data (inference is circular and cannot bootstrap a new network). Storage = relational
**capability spans** (`service_area_capabilities`: SA × capability × effective_from/to; non-overlap
+ ≤1 open, fiscal-year comparison per ADR 0004) — the ratified stint pattern, NOT period-keyed
jsonb (`service_areas.report_periods` stays empty and retires with `units.period_entries`).
Confirm-each-period UX = span operations (confirm no-op / change close+open). #8 owns
capability-span semantics alongside unit stints — one temporal rulebook family.

**IPP boundary rule (Eugene, 2026-08-25, data-confirmed 0/12 + 2/12 fills):** units provided by an
IPP carry **output metrics only** for the off-taking utility (Rated Capacity / Generation /
Downtime @ provider=IPP) — never consumable inputs (the "Fuel and Oil" subgroup): those are the
IPP operator's costs, invisible to and unreportable by the off-taker. Encoded in the relevance
verifier (consumables not expected where a technology is IPP-only for a utility, via
`units.provider_id`). The general principle: **expectation follows the ownership boundary — a
utility is only asked what it can actually know.**
*Pending nuance (disposition open with Eugene, migration log `11c9010`):* **fuel** may legitimately
cross the boundary under fuel-supply/pass-through arrangements (utility supplies fuel to its IPP)
— two real CUC Fuel Oil @ IPP-diesel values (FY2022/23, ~28.4M/28.6M) are **soft-deleted and
preserved**, explicitly NOT ruled invalid. If Eugene later rules them genuine: restore Fuel Oil @
IPP and **narrow this rule to lube-oil-only**. Lube oil stays cleaned (0 fills anywhere —
unambiguously operator O&M).

**Cross-dimension conditional (structural invariant, banked 2026-08-25 from the Hours Worked
290–292 case):** the four energy dimensions (provider / category / technology / asset_class)
expand **only under `utility_function` = Generation**; under Transmission / Distribution /
Ancillary Services every energy dim carries its **All** member — those dims *describe generation*,
so a non-Generation slice with a pinned energy dim is structurally meaningless. The
relevance/shell generator enforces this as an invariant, not per-measure config. Escape hatch per
case law: a future measure genuinely needing energy-dim expansion under a non-Generation function
is an **explicit Eugene decision on evidence**, never a silent allowance.

## 2. Requirements on the grain columns

1. **Chain-consistency validation** (replaces the old exactly-one CHECK): a row's filled grain
   columns must match **real parentage** — a unit row's station/area/utility/country must equal
   that unit's actual FK chain; an area row's utility/country must equal the area's owner.
   Enforced at the write path — the denormalized chain must never contradict the entity tables.
   **Ownership DECIDED (Eugene, 2026-07-27): #2 builds the enforcement** as shared write-path
   machinery (the `lib/data-entry/value-router.ts` pattern: one shared function every write path
   calls; trigger as optional belt-and-braces). #8 specs/verifies the semantics; #11 routes all
   entry surfaces through it; no stream hand-rolls chain writes.
   *Scoping note (#11, 2026-07-27):* `value-router.ts` is currently wired into the **v2** entry path
   only (`enter-data-v2/service.ts`) — the older `enter-data` path still hand-rolls writes. The
   grain-writer must cover BOTH paths; #11 will flag v1 write sites lacking a clean seam so #2 can
   shape the writer's signature to fit them.
2. **Derived `grain_level`** (`'unit'|'station'|'area'|'utility'|'country'`): a **generated**
   column (or Silver-view field, #2's choice) computed from which columns are filled. Generated ≠
   the "dual-encoding disease" §1.5 forbids — it cannot disagree with the address. Purpose:
   humans/AI write `WHERE grain_level='utility'` instead of NULL-pattern logic they will get wrong.
   `kpi_actual` carries the same.
3. **One grain per measure per period:** within a report period, a measure's rows sit at exactly
   one grain level (the measure's declared `strata`, writer-validated per medallion §1.5) —
   otherwise `WHERE country_id=X` double-counts. **Per period**, not global: §1.6 mixed-grain
   measures (e.g. lump-sum→split revenue) legitimately change grain across periods.
4. **No sentinel/aggregate rows as grain values — ever** (the clause that rejects the old spec
   target): no "All areas" member, no "All Countries"-style anchors, no benchmarking-group
   addressing. **The rule is now vacuously enforced for the reference tables: the entire sentinel
   chain was DELETED from the dev DB 2026-07-27** (Eugene one-shot, #14 executed, leaf→root: "All
   Service Areas" 89 → "All Utilities" org 1 → "All Countries" 100000 → sub_regions 10000/1/5;
   real data re-homed first; backups `backup.sentinel_*_20260727` — since purged with the whole
   `backup` schema, Eugene-approved 2026-07-28, so the deletions are final). Zero sentinel rows remain in
   `countries`/`sub_regions`/`organisations`/`service_areas`; the `country_id < 1000` CHECK is
   downgraded from required guard to optional hardening against future sentinel re-creation
   (#2's discretion). Post-state independently verified by #13 (2026-07-27): **countries = 26, all
   real M49; sub_regions = 6, all real UN; 0 sentinels.**
5. **Unique address:** as built — `uniq_entry_address` UNIQUE **NULLS NOT DISTINCT** over
   period + measure + 5 grain columns + 10 dims. Keep it; it is what makes NULL-above-level rows
   deduplicate.
6. **Drop `subregion_id` and `region` from `data_entries`** (small subtractive DDL): both are
   determined by `country_id`, are excluded from the unique address, and are "never entry levels"
   (spec §1.5) — keeping them writable is drift risk. Derive them in Silver/gold from `country_id`.
   *Post-drop note (#13, 2026-07-27):* the spent one-off `scripts/cleanup-m49-country-duplicates.ts`
   safety-checks `data_entries.subregion_id` — already applied on dev, don't re-run it against a
   post-drop DB (it will error on the missing column, by design not by accident).
7. **`country_context` fold-or-keep — RESOLVED (Option 2, `fcf8e4e`, 2026-08-19):** the
   side-channel won, formalized — national annual figures stay in `country_context`
   (country × metric × `period_year` + unique, DDL applied) and are projected to
   utility × report_period shape at read time by a carry-forward bridge. #8 validated the
   architecture; open holes flagged to #4: H1 the bridge's blanket "report_date year −1"
   FY mapping must resolve via the canonical period dim / `financial_year_end` (no second
   source of time truth); H2 unbounded carry-forward needs a staleness flag (no silent
   stale denominators in benchmarking KPIs); snapshots must pin RESOLVED context.

## 3. Backfill: promoting entries off the virtual entities

Unchanged in intent; the promotion now writes **the chain**, not a single anchor. The virtual rows
say where each entry belongs (`units.power_station_id` / `.service_area_id`;
`service_areas.utility_id`; `organisations.country_id`):

| Today's anchor | Becomes (chain filled) | Rule |
|---|---|---|
| virtual `unit` **with** `power_station_id` | station+area+utility+country; unit NULL | station-level data parked on a station virtual |
| virtual `unit` without station | area+utility+country | grid-level data parked on a grid virtual |
| virtual `service_area` | utility+country; area NULL | org-level data parked on a virtual area |
| ~~org-level rows whose measure's `strata` = country~~ | ~~country only; utility NULL~~ | **SUPERSEDED by country-context Option 2 (`fcf8e4e`, 2026-08-19):** historical country-strata values reimport INTO `country_context` (country × metric × period_year) — NOT as country-anchored entries; national figures never enter `data_entries` (read-time carry-forward bridge projects them; #8-validated with holes H1–H3 flagged, see board). The `country_id` anchor remains for `kpi_actual` computed rollups + any future genuinely-entered country facts. |

⚠ Verify the virtual→level convention against actual rows before trusting it (e.g.
`SELECT … WHERE is_virtual GROUP BY strata_id`); one transaction; per-level row counts
before/after; nothing dropped.

**Promotion is mismatch-driven, not virtual-driven (widened 2026-08-03; re-corrected same day
on Eugene-driven evidence):** the table above covers flagged virtuals, but **25 further sentinel
service areas exist — all named "All Service Areas", one per utility, marked Utility-strata**
(the SA analog of the retired "All Utilities"/virtual-unit pattern; they survived the 2026-07-27
sentinel purge because they hold parked data, and their `is_virtual` flag is not reliable).
**Every** entry on them is a parked utility-level fact → promote to the utility anchor, then
retire the 25 rows with the other virtuals. (An earlier framing of these as "real areas
coextensive with single-grid utilities" was wrong — no real area is Utility-strata; the 66 real
grids are all ServiceArea-strata.) Detection for the whole backfill is therefore
**anchor-level ≠ measure-declared-strata mismatch** — the robust net that catches sentinels
regardless of flags — with `is_virtual` as corroborating signal, not the filter.
(`service_areas.strata_id`: KEPT this DDL as the identifying signal for the 25; after their
retirement it is vestigial — joint #8/#4 assessment, likely outcome **drop**, per unit-spec §10.) Expect and dedupe legacy duplicate addresses first (the old
`uniq_entry` was never unique). After no entries reference them: soft-delete virtual
`units`/`service_areas`; drop `is_virtual` only once onboarding/import paths stop creating them.

**The "All Utilities" supra-aggregate — ✅ RETIRED 2026-07-27** (Eugene one-shot, executed by #14,
ahead of the migration): real data re-homed first (14 units, the Rarotonga Grid service area, 2
report_periods, user 21 — nothing orphaned, per the promote-don't-orphan rule), then the chain
deleted leaf→root with 0-ref checks at each step ("All Service Areas" 89 → org 1 → country 100000
→ sub_regions 10000/1/5). Backups `backup.sentinel_*_20260727` (purged 2026-07-28 with the whole
`backup` schema — deletions final). Remaining for #2's migration pass:
only the ordinary per-utility virtuals from the promotion table above — the supra-utility case no
longer exists.

## 4. RLS (#12) — native but with one sharp edge

`utility_id` on every owned row **is** the tenant column — no extra column needed (improves on the
old Option A §4). Two obligations:
- **Policy shape:** country-level facts are shared (`utility_id IS NULL`), so the policy is
  `utility_id = current_setting(…) OR utility_id IS NULL` (or a separate read policy for shared
  rows). #12 owns the final shape.
- **Leak guarantee:** no utility-owned fact may ever be written with NULL `utility_id` — that's a
  cross-tenant leak. The §2.1 chain-consistency validation is also the enforcement point here:
  every sub-country row must carry its real `utility_id`.
- **Enable-time plumbing (#12's plan, 2026-07-28 — confirmed aligned):** RLS activation requires
  (a) the app to `SET app.current_org` (and `app.is_global` for BMO/DEV) per request — an
  app-layer task that lands with the #8/#11 query pass; (b) ingestion/service accounts (Power BI)
  on a `BYPASSRLS` role — global access is a **role/session flag, never a sentinel org row**.
  Sequencing: #12 verifies the §2.1 chain-consistency writer is live BEFORE enabling RLS
  (their checklist). D1 remains gated on Eugene's greenlight + the writer shipping.

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
