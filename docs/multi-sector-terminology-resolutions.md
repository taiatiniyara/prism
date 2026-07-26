# Multi-sector terminology — proposed resolutions to ADR 0003's open questions

**Stream:** #13 Multi-sector (water/sanitation) · **Owner:** `PRISM 2 #13 multi-sector`
**Status:** ✅ **RATIFIED — all five questions closed (2026-07-27).** Q1 ✅ Eugene · Q2 ✅ #8 · Q3 ✅ #11 · Q4 ✅ #10 · Q5 ✅ Eugene (Phase-5a go). ADR 0003 → **Accepted**. Implementation: #13 builds the label-layer foundation + app-config interim behind the resolver now; #2 folds the additive DDL when convenient; #11 swaps app-config→`sector_terminology` table + owns ongoing UI surfacing when the table lands.
**Parent decision:** [adr/0003-multi-sector-terminology.md](adr/0003-multi-sector-terminology.md) (Proposed 2026-07-26, merged PR #55).
**Purpose:** turn ADR 0003's five open questions into concrete, ratifiable answers so the cheap **label layer** can proceed without blocking the electricity migration (#2), and the **full water/sanitation modelling** is scoped as a separate, sequenced initiative.

> This doc is the design substance behind stream #13. It does **not** issue schema changes — per the board, #2 owns all shared-table DDL. It states *what* should be built and *who signs off*, so implementation can follow ratification.

---

## Grounding (what these answers are built on)

- **ADR 0003 decisions** (unchanged, the frame for everything below): keep generic storage (no `service_area → grid` rename); terminology is presentation-layer; `sector` (Electricity / Water / Sanitation) is first-class; sector is modelled on the **service / area / measure, not the utility** (utility↔sector is many-to-many); sequence the label layer ahead of full modelling; never block #2.
- **Medallion principle §0.2 "IDs in the tables, names in the views"** ([schema-redesign-medallion.md](schema-redesign-medallion.md)) — labels resolve at Silver/UI, not in storage. Storage carries FKs/keys only.
- **Energy-taxonomy precedent (§1.2a, applied 2026-07-23)** — the `asset→category→technology` rename changed *only* managed-list names, UI labels, the AI dictionary, and docs; **DB columns and dimension string keys were left unchanged.** This is the exact shape of a label layer and the strongest in-repo precedent that "relabel without re-migrating" is a solved, low-risk pattern here.
- **#8 hierarchy requirements** ([multi-level-hierarchy-requirements.md](multi-level-hierarchy-requirements.md)) — `service_area` is **level 3** of five anchor levels; #8 owns the hierarchy semantics, #2 writes the DDL.
- **#10 org model** ([tiered-access-and-registration-spec.md](tiered-access-and-registration-spec.md) §2) — two org axes: `relationship` (utility / ppa_member / subscriber — "how you relate to PRISM & do you pay", a typed enum) and `entity_type_id` (managed list — "what kind of org"). Explicitly independent axes.

---

## Q1 — Exact per-sector labels

**Question (ADR):** Electricity = "Grid" / "Network" / "Service Territory"? Water = "Supply Zone" / "DMA" / "Service Area"? Sanitation = "Catchment" / "Sewershed" / "Collection Zone"?

**Proposed resolution — reframe from *blocker* to *seed content*.**
Because the terminology map is **data** (Q3), the exact strings are BMO/domain-editable and are **not an architectural blocker**. Ship with a recommended seed set; let the domain expert tune the strings without a code change.

Recommended seed for the first concept (`service_area`):

| Sector | Recommended label | Alt(s) | Note |
|---|---|---|---|
| Electricity | **Grid** | Network, Service Territory | Most relatable. Caveat (from the ADR): "Grid" strictly means the physical network, not the served *territory* — `service_area` is the territory. If precision beats familiarity, use "Network Area". Because it's data, this is reversible. |
| Water | **Supply Zone** | DMA (District Metered Area), Distribution Zone | "DMA" is the technical term; "Supply Zone" reads to non-engineers. |
| Sanitation | **Catchment** | Sewershed, Collection Zone | "Catchment" is widely understood; "Sewershed" is the precise term. |

> ✅ **SETTLED by Eugene (2026-07-27):** **Electricity = "Grid"** · **Water = "Supply Zone"** · **Sanitation = "Catchment"**. Rationale: the audience is CEOs + regulators — exactly who say "grid"; the physical-network-vs-territory imprecision is accepted, and because the label is editable data it can flip to "Network" if a regulator ever objects.

**Ratifies:** Eugene / domain expert (content only). **Not blocking** the architecture. ✅ **Ratified.**

---

## Q2 — Is `service_area` shared geography across sectors, or sector-specific rows?

**Question (ADR):** one physical territory tagged with a sector, vs. separate area rows per sector for the same geography.

**Proposed resolution: (B) sector-specific `service_area` rows** — add a `sector_id` FK to `service_areas` (NOT NULL; backfill all existing rows → Electricity).

**Rationale:**
1. **Boundaries genuinely differ by sector.** Electricity distribution areas follow feeders; water supply zones/DMAs follow pressure zones and topography; sewer catchments follow gravity drainage. They rarely coincide, so "one geography, many sector tags" would model a fiction.
2. **The ADR already implies (B).** Decision #4 says "a `service_area` belongs to a sector" and "benchmark within a sector; a multi-sector utility appears in each relevant sector's benchmark on its own slice." Per-sector rows *are* those slices.
3. **Minimal, non-breaking migration.** One additive column, backfilled to Electricity; every existing area is unambiguously electricity today. No re-keying, no data movement.
4. **Benchmark-within-sector falls out naturally** — grouping by `sector_id` needs the sector on the row, and the finest grain (the area) is where it must live.

**Cost of the alternative (A):** a separate area↔sector junction + shared-geography semantics, which is more machinery and wrong whenever boundaries differ (the common case). Rejected.

**Edge case:** a utility that genuinely runs one combined area for all sectors would carry duplicate area rows (one per sector). This is rare, the duplication is cheap, and per-sector rows are needed for benchmarking anyway.

**Ratifies:** **#8** (owns the `service_area` hierarchy level) confirms a `sector_id` attribute on the level is acceptable; **#2** writes the additive column when it folds hierarchy DDL in. Additive + Electricity-backfill ⇒ non-blocking to the #2 migration.

> ✅ **RATIFIED by #8 (2026-07-27).** `service_areas.sector_id` (NOT NULL, backfill → Electricity) is an attribute on an anchored entity with **no interaction** with exactly-one-anchor / `entry_level` / the unique address; sector derives via the anchor join at levels 1–3 and must **not** become a 6th anchor or an address column. Three flags from #8, folded in below:
>
> - **(a) Retire the existing `provides_electricity/water/sanitation` booleans in the same change.** `service_areas` today carries three `provides_*` booleans (`db/schema/utility.ts` — `provides_electricity` default `true`, water/sanitation `false`) — a coarse denormalized "which sectors this area touches" flag, effectively a proto-Option-A. Under one-sector-per-row they become a **second, conflicting source of truth**, so `sector_id` **supersedes** them: **drop** the three booleans (or derive them from `sector_id`) as part of the same additive migration. **Verify-first caveat:** confirm no live rows have `provides_water`/`provides_sanitation = true` before assuming a clean 1:1 backfill; any true multi-sector area row must **split** into one row per sector (none expected today — PRISM is electricity-only — but check, don't assume).
> - **(b) Levels 4–5 (org / country) span sectors.** Sector is on the area (levels 1–3); an org- or country-anchored row is inherently cross-sector. Sector-*sliced* org/country-level data, if ever needed, is a **dimension** question for Phase 5c — **not** an anchor change and not part of this additive step.
> - **(c) No ordering constraint vs. #8's virtual-area retirement.** Virtual `service_area` rows getting the Electricity `sector_id` backfill before they're soft-deleted is harmless; the two changes don't need sequencing.

---

## Q3 — Where does the terminology map live?

**Question (ADR):** dedicated `sector_terminology(sector_id, concept_key, label)` table, app config, or the managed-lists system?

**Proposed resolution: a dedicated `sector_terminology(sector_id, concept_key, label)` lookup table**, BMO-maintained; labels resolved at the Silver/presentation layer keyed by `(active_sector, concept_key)`.

**Rationale:**
- The map is a **(sector × concept) matrix**, not a flat controlled vocabulary. The managed-lists system is keyed `(list_id → items)` — a one-dimensional list — so a 2-D matrix doesn't fit it cleanly. Using managed-lists would force an awkward encoding.
- **App-config (a hardcoded constant map)** is the cheapest start but makes every label tweak a code deploy. Since relatability is a selling point and Q1's strings are a domain call, the map should be **data, not deploys** — consistent with the medallion principle and the energy-taxonomy precedent (labels changed as data).
- A dedicated table is the exact fit, is BMO-editable, and **generalizes beyond `service_area`** — `concept_key` is open, so `provider`, `source`, `units`, `utility_function` all get per-sector labels later through the same mechanism.

**Companion decision — model `sector` itself as a typed reference/enum, not a managed list.** `sector` drives code behaviour (which dimensions apply, measure relevance gating), so it is **structural** — same call #10 made for `relationship` (enum, code branches on it) vs `entity_type` (managed list, pure vocab). A small `sectors` reference table (or enum) that `sector_terminology.sector_id`, `service_areas.sector_id`, measures, and the M:N junction all reference.

**Interim allowed:** for the very first electricity-only relabel, an app-config seed is acceptable to ship day one, but land the table so labels become data before water/sanitation arrive.

**Ratifies:** **#11** (UI — owns label resolution at the presentation layer) + **#2** (creates the lookup + `sectors` reference table; both are pure additive lookups, non-blocking) + BMO (maintains the content).

> ✅ **RATIFIED by #11 (2026-07-27)**, with five UI-side contract conditions (all additive; #11 owns the UI surfacing):
>
> 1. **One resolver, one source.** The same terminology map feeds **both** the Silver display-string views (AI dictionary / exports) **and** the client UI — no duplicate map in two layers, or they drift.
> 2. **Single filter-context provider for `active_sector`.** UI reads labels via a `t(concept_key)` / `useTerm()` hook — never hardcoded strings in components.
> 3. **Guaranteed neutral fallback.** Resolution chain: `(active_sector, concept_key)` → **neutral default kept in CODE** (always present, even against an empty table) → raw key only as an absolute last resort. The UI must never render a blank or snake_case key. ⇒ **seed a neutral/default label per `concept_key` in code.**
> 4. **Add `label_plural`** (nullable; fallback = `label`). List headers/counts need plurals — don't string-concat "s" (won't generalize to later concepts).
> 5. **`concept_key` is a registered constant set** on the UI side, so a typo is a compile/lint error, not a silent fall-through to the raw key.
>
> **Phase 5a app-config interim is fine day-one — PROVIDED it sits behind the resolver indirection now**, so the later config→table swap is zero component churn. **Scope:** sector-scoped only, no per-org relabel. **Perf:** map is small → load once per session + cache, invalidate on BMO edit; never a per-render fetch.

**Revised table shape (with #11's conditions):**
```
sector_terminology(sector_id → sectors, concept_key, label, label_plural NULL, updated_by, updated_at)
```
plus a **code-level neutral default** per `concept_key` (the guaranteed fallback, not stored) and a **registered `concept_key` constant set** shared by UI and Silver. Resolver is a single shared function consumed by both the Silver views and the `useTerm()` hook.

---

## Q4 — How does `sector` interact with #10's `entity_type` / `relationship` axes?

**Question (ADR):** is `sector` a third org axis, or a property of the service?

**Proposed resolution: `sector` is a third, fully orthogonal concept — NOT a third org axis.** Model utility↔sector as an **M:N junction** (`organisation_sector(organisation_id, sector_id)`), independent of and additive to #10's two axes.

**Rationale:**
- #10's axes are about the **organisation**: `relationship` = "how do you relate to PRISM & do you pay"; `entity_type` = "what kind of org are you". `sector` is about **what services a utility provides** — a property of the service/area/measure (ADR decision #4).
- They move independently. One org can be `relationship = utility`, `entity_type = government`, and operate in `{electricity, water, sanitation}` simultaneously. Folding sector into either org axis would couple things that vary independently — the exact mistake #10 avoided by splitting `is_utility` into two axes.
- The junction `organisation_sector` expresses "this utility operates in these sectors" — it drives which sectors' benchmarks the utility appears in and populates its sector picker/filter context. It touches **nothing** on `organisations` and does not alter `relationship` or `entity_type`.

**Ratifies:** **#10** confirms sector stays off the org axes and the additive `organisation_sector` junction is compatible with their model. Zero change to their two-axis design.

> ✅ **RATIFIED by #10 (2026-07-27).** Confirmed the M:N `organisation_sector(organisation_id, sector_id)` shape, kept OFF `organisations`, is correct — a scalar sector column would be wrong for a utility running both electricity and water; `relationship`/`entity_type_id` untouched. Recorded in [tiered-access-and-registration-spec.md](tiered-access-and-registration-spec.md) §2 with an explicit "do NOT add a sector column to `organisations`" guard. **Non-blocking downstream heads-up from #10 (no action now):** if PPA ever sells dashboard plans *per sector*, their `plan_entitlement` (§3.2) gains a sector qualifier — purely additive, revisited only if a real multi-sector subscription appears; does not affect this junction.

---

## Q5 — Timing: when is the label layer worth shipping, independent of water/sanitation modelling?

**Proposed resolution: split the work into three independently-shippable phases; ratify the direction now; keep every phase off #2's critical path.**

- **Phase 5a — electricity-only relabel (shippable immediately, near-zero risk).**
  Only one sector is live (Electricity). Resolve `service_area`'s display label through the terminology map defaulting to the Electricity row ("Grid"). This is a pure display-string change — the multi-sector structure isn't load-bearing yet. Can even ship as the app-config interim (Q3) before the table lands.
- **Phase 5b — make `sector` first-class (lands with/before the first non-electricity utility).**
  `sectors` reference table + `sector_terminology` table + `service_areas.sector_id` (backfill Electricity) + `organisation_sector` junction + sector in the filter context. All additive; independent of the `data_entries` medallion migration.
- **Phase 5c — full water/sanitation modelling (separate, deferred initiative).**
  Water/sanitation dimension sets, measure catalogues, units, applicability/relevance. Gated on: (1) the electricity migration (#2) completing, and (2) a water/sanitation domain-expert engagement to author the catalogues. **This is the big one and explicitly must not ride on #2** (ADR decision #5).

**Sequencing vs. #2:** the label layer does **not** depend on #2 and #2 does not depend on it (orthogonal per ADR #5). The one caution is *legibility, not dependency*: don't interleave a visible terminology switch with #2's migration cutover, to avoid confusing UI churn. #2 is currently **paused** with its DDL largely applied to the DB, so there is a clean window for Phase 5a/5b now.

**Ratifies:** all three streams + Eugene on go/no-go for shipping Phase 5a and scoping 5c.

---

## Ratification checklist

| # | Question | Proposed answer | Ratifier(s) | Blocking? |
|---|---|---|---|---|
| Q1 | Exact per-sector labels | **Grid / Supply Zone / Catchment** (BMO-editable as data) | **Eugene ✅ ratified 2026-07-27** | No (content) |
| Q2 | Shared vs sector-specific areas | **(B)** `service_areas.sector_id`, backfill Electricity; **retire `provides_*` booleans** in same change | **#8 ✅ ratified 2026-07-27** + #2 (DDL) | No (additive) |
| Q3 | Where the map lives | Dedicated `sector_terminology` table (+`label_plural`, code neutral-default) + `sectors` ref/enum; one resolver for Silver+UI | **#11 ✅ ratified 2026-07-27** + #2 (DDL) + BMO | No (additive) |
| Q4 | Sector vs org axes | Third orthogonal concept; `organisation_sector` M:N junction; org axes untouched | **#10 ✅ ratified 2026-07-27** | No (additive) |
| Q5 | Timing | **Phase 5a GO** (relabel now) → 5b (sector first-class) → 5c (full modelling, deferred, gated on #2 done) | **Eugene ✅ go 2026-07-27** | No (off #2's path) |

**None of the proposed changes block #2.** All schema touches are additive lookups/columns/junctions with Electricity backfill; the full water/sanitation modelling (5c) is deliberately deferred.

---

## Requested action from each stream

- **#8** — ✅ **ratified 2026-07-27** (`sector_id` on the level; retire `provides_*`; flags a/b/c folded in above).
- **#10** — ✅ **ratified 2026-07-27** (sector off the org axes; `organisation_sector` M:N compatible).
- **#11** — ✅ **ratified 2026-07-27** (five UI-side conditions folded into Q3 above; #11 owns the resolver + `useTerm()` hook, to wire once the table lands).
- **#2** — note (do not action yet): if ratified, the additive DDL (`sectors`, `sector_terminology` [incl. `label_plural`], `service_areas.sector_id` + **drop/derive the `provides_electricity/water/sanitation` booleans**, `organisation_sector`) is small and Electricity-safe; fold in when convenient, no urgency, non-blocking. Verify no `provides_water`/`provides_sanitation = true` rows before the 1:1 backfill (per #8 flag a).
- **Eugene / domain** — the only remaining gate: Q1 label strings (esp. "Grid" vs "Network Area" for electricity) + Phase-5a go/no-go. All three streams have ratified.
- **Eugene / domain** — the Q1 label strings (esp. "Grid" vs "Network Area" for electricity) and the Phase 5a go/no-go.
