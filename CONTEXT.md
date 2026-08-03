# CONTEXT.md — PRISM Domain Glossary

A glossary of domain terms, not a spec. No stack choices or implementation details.

---

## Core Entities

- **PRISM** — benchmarking platform for Pacific electricity utilities, owned by PPA.
- **PPA (Pacific Power Association)** — regional industry association governing the platform, setting PPA Targets, providing the BSC Master Template.
- **Utility / Organisation** — an electricity provider that is a PPA member. Has service areas, power stations, units, report periods, users, and a BSC. (DB: `organisations`, `is_utility = true`.)
- **Country** — a Pacific Island nation (ISO codes, currency, UN sub-region, ADB membership).
- **Sub-Region** — UN continental regional grouping (Melanesia, Micronesia, Polynesia).
- **Service Area** — a geographic territory within a utility. The primary scoping dimension for data entry.
- **Power Station** — a physical generating facility in a service area.
- **Unit** (formerly *Energy Resource*) — a generator or storage instance, or an aggregation, within a power station (provider, technology, rated capacity). DB: `units`; code type `Unit`.
- **Stint / Unit Activation** — a continuous operating-state period of a Unit: a span over which its service area, power station, and rated capacity are all constant. Any change — moving to another service area (within the same utility), a derate, or decommissioning — ends the current stint; a **deactivation is the gap between two stints**. The Unit Activation timeline is the **single source of truth** for which units are active, where, and at what rated capacity in any period — it *replaces* per-period resource state. A change of the unit's **technology** is a new Unit, not a new stint (identity change).
- **Aggregate Unit** — a Unit that lumps several physical generators reported together (used by some utilities for some grids), named "All gens — &lt;grid&gt;" or, technology-specific, "All solar gens — &lt;grid&gt;". Marked by an **`is_aggregate` flag** (the exact generator count is not tracked). At data entry, an aggregate unit presents a different form: **downtime is entered in MWh (lost energy), not hours**. Distinct from the retired *Virtual Unit* placeholder.
- **Virtual Unit** — *(retired)* an old-Prism per-grid grid-total placeholder (`is_virtual = true`, "Virtual GEN …"), excluded from all fact reads. Superseded under the medallion framework by gold rollups (totals = All-row else sum of detail); not carried into the stint model.

## Data Entry (medallion redesign, 2026-07)

- **Measure Definition** (formerly Input Definition) — a pure measure: what is being
  measured, never where it applies. Name, auto-derived variable name (slug + unit suffix;
  Units N/A → no suffix), dictionary definition + synonyms, category/subcategory
  (function-neutral nature themes), unit, data type, collection level. Option-typed measures
  (data type = managedLists) carry an explicit `option_list_id` naming the source list
  (e.g. Gender of CEO → the Gender list), not the old measure-name==list-name convention.
  ~60 measures replace 515 legacy definitions at the catalogue collapse.
- **Dimension** — a "which one" axis on the entry row, never in a measure's name. Ten:
  provider, energy type, source, resource type, customer type, payment mode, consumption
  band, division, gender, utility function. Each has an explicit **All member**; dimension
  columns are never NULL (no NULL-as-All).
- **Measure Dimension Scope** — per measure × dimension, how the dimension behaves:
  `not_applicable` (auto-All) · `all_members` (expand for everyone) · `by_context` (expand
  per the utility's context). A measure is *Contextual* iff any dimension is by_context —
  a computed label, not stored.
- **Data Entry** — one fact at one full address: period + hierarchy (utility/area/station/
  equipment) + measure + all ten dimensions. Value stored typed (numeric/boolean/option/
  text; ratios for %) with the legacy raw string retained in `value`. Generation/storage
  measures are collected at **equipment level**; all higher levels are derived, never
  entered (totals = coalesce entered-All-row else sum of detail).
- **Data Entry Status** — Requested → Pending → Entered → Reviewed → **Approved**
  (publication event; Endorsed retired) · Not Available.
- **Relevance Shell** — a pre-created empty entry row (address only, status Requested)
  generated per utility-period from measure scope + utility context; unfilled shells ARE
  the gap report.
- **Measure Dimension Applicability** — catalogue-level, BMO-maintained table (measure ×
  dimension × valid members) declaring WHICH members are valid for a by_context dimension
  (e.g. Fuel Oil applies only to Diesel/Heavy Fuel sources). Complements Measure Dimension
  Scope (which dimensions) with which members. No rows = all members valid.
- **Context Profile** — per-utility, per-period snapshot of the facts that drive relevance:
  service areas, tariff structure (per customer_type × payment_mode: rate count, fixed
  charge), and flags (transmission network, buys-from-IPP). Cloned forward each period; the
  BLO confirms/edits it. **Unit relevance and rated capacity are NOT part of this snapshot** —
  they are derived from the Unit Activation timeline (see *Stint*), event-dated rather than
  per-period-confirmed. (Superseded the old per-period resource state / `units.period_entries`
  blob.)
- **Generation energy-balance check** — a per-generator, per-period validation: equivalent
  full-load hours (Electricity Generated ÷ Rated Capacity) + planned + unplanned downtime must
  not exceed hours in the period; catches impossible generation/downtime combinations.
- **Expected inputs (computed)** — for each active measure, its by_context dimensions expanded
  across (applicability members ∩ context). The required-input count is this set's size —
  computed, never a stored/curated list. Replaces the retired input/tariff/transmission
  relevance tables.
- **Tariff structure** — a block tariff has N rates and N−1 block limits (the final rate is
  unbounded). Block limits are cumulative from zero; rates/charges are stored tax-exclusive
  (VAT/GST is a separate measure).
- **Scoped Operand** (formula engine v2) — a KPI formula token bound to a measure + a
  dimension scope, with an auto-generated alias; one measure may appear under several
  scopes in one formula (e.g. `gen_ipp / gen_total`).
- **Medallion layers** — Bronze: raw entry tables · Silver: `data_entries_enriched`
  (ids resolved to names, derived labels) · Gold: business-ready views (`fact_kpi`,
  rollups, reporting status, BSC alignment, external slices). Gold owns ALL aggregation;
  read-only, derived; the AI/dashboards/reports read silver/gold only.
- **DL Definition** — legacy training platform dimension; mapped via
  `input_dl_def_mappings` for backward compatibility.

## KPIs & Benchmarks

- **KPI Definition** — metadata blueprint: name, formula, formula inputs, category, unit, type (benchmarking/custom), targets, limits, aggregation level.
- **KPI (instance)** — calculated value per report period, service area, unit, etc.
- **KPI Calculation Attempt** — job tracking for a KPI computation (status, retries, error details).
- **KPI Target** — desired future value per utility, year, optionally month.
- **KPI Trajectory** — increase / decrease / same per (utility, KPI) pair.
- **KPI Limit** — acceptable range boundaries (lower/upper) per year/month.
- **Benchmarking KPI** — standard PPA-defined KPI for cross-utility comparison.
- **Custom KPI** — utility-specific KPI proposed via Custom KPI Request pipeline (submitted → reviewed → approved/rejected/replaced).
- **Industry Benchmark** — reference values from World Bank, ADB, IRENA, PPA: developing nation, developed nation, Pacific regional average, PPA target.
- **Composite Score** — overall performance ranking combining SAIDI, losses, cost recovery, electrification.

## Key Metrics

- **SAIDI** — System Average Interruption Duration Index (minutes/customer/year, lower_is_better, PPA target 360).
- **SAIFI** — System Average Interruption Frequency Index (interruptions/customer/year, lower_is_better, PPA target 10).
- **System Losses** — total electricity losses as % of generation (PPA target 12%).
- **Technical Losses** — physical T&D losses (PPA target 8%).
- **Non-Technical Losses** — commercial/collection losses (PPA target 4%).
- **Tariff Recovery Rate** — % of operating costs covered by tariff revenue (PPA target 100%).
- **Electrification Rate** — % of households with electricity access (PPA target 90%).
- **Renewable Penetration** — % of generation from renewables (PPA target 50%).
- **Capacity Factor** — actual vs. maximum possible generation output (PPA target 60%).
- **Diesel Dependence** — share of installed capacity that is diesel (typically 60-80% of opex for Pacific utilities).
- **Collection Efficiency** — % of billed revenue actually collected (PPA target 90%).
- **DSCR** — Debt Service Coverage Ratio (PPA target 1.5).
- **Operating Ratio** — opex / operating revenue (PPA target 70%).
- **LTIFR** — Lost Time Injury Frequency Rate per million hours worked (PPA target <5).

## Balanced Scorecard (BSC)

- **BSC / Strategy Map** — Kaplan-Norton strategy framework with 4 perspectives, 8 hierarchy levels, cause-effect links.
- **4 Perspectives** — Financial, Customer, Processes/Operations, Learning & Growth/Development.
- **8-Level Hierarchy** — Perspective → Overall Objective → Key Focus Area → Strategic Objective → Strategic Lever → Specific Objective → Initiative/Project → KPI.
- **BSC Master Template** — canonical PPA framework (`bsc_template_nodes`), maintained centrally.
- **BSC Utility Overlay** — per-utility selections + custom nodes layered on the master template.
- **BSC Initiative / Project** — an improvement effort (ongoing or time-bound with status) under a Specific Objective; carries KPIs.
- **BSC KPI Link** — connects a KPI Definition (or pending Custom KPI Request) to an Initiative.
- **BSC Objective Link** — cause-effect edge between map nodes: `drives`, `enables`, `constrains`.
- **BSC Theme** — DEV-editable styling overrides for BSC elements.

## AI / Energy Expert

- **PRISM AI (Energy Expert)** — Anthropic Claude-powered assistant with 5-step reasoning chain (Diagnose → Connect → Position → Recommend → Caveat), opinion-safety protocol, 7 audience registers.
- **AI Tools** — 67 functions (38 PRISM-native + 29 Power BI domain) for data retrieval, analysis, visualization.
- **Data Source Priority** — Power BI first, PRISM-native fallback on failure, then honest gap reporting.
- **Audience Register** — 7 communication personas: CEO/Board, Manager/Ops, Staff/Analyst, Government/Regulator, Consultant, Donor/DFI, Education/Researcher.
- **Stakeholder Type** — self-identification for EXT users: government, regulator, consultant, donor, dfi, researcher, education.
- **AI Chat Session** — conversation thread per user with context summary.
- **AI Chat Turn** — single user-assistant exchange with token counts, latency, model info.
- **AI Tool Call** — tracked invocation of a tool within a turn.
- **AI Feedback** — positive/negative user feedback on responses.
- **AI Review Queue** — flagged turns needing human review.
- **AI Usage Metrics** — daily per-user request counts, token usage, cost.

## Roles & Access

- **User** — authenticated person with email, role, organisation, status (active/pending/deactivated).
- **Roles** — DEV (full), BMO (benchmarking manager), BLO (**Utility Liaison** — the utility's single contact point for all benchmarking-dataset matters; manages its own org's users and bulk-uploads datasets via PRISM's Excel templates), CEO, EXE, DAOF/DAOH/DAOO (data-entry officers — **also** bulk-upload datasets via the Excel templates), MGR (manager), EXT (external). *(Note: `scripts/seed.ts` describes BLO as "Bulk Load Officer" — a misnomer; the role is Utility Liaison. Bulk-load is a capability BLO shares with the DAOs, not its definition.)*
- **Proxy** — Next.js middleware protecting /dashboard/*, /data-entry/*, /settings/*, /profile/*, /docs/*, /prism-ai/* via session check + role-based route gating.
- **Utility Context Scope** — DEV feature to scope the view to a specific utility.
- **External Registration** — registration for non-utility users (consultants, donors, researchers).

## Data & Operations

- **Report Period** — time-bound reporting window (Financial Year, Monthly) per utility; scopes all data entries and KPIs.
- **Benchmarking Report** — the periodic PPA cross-utility performance report. Lifecycle: BMO/consultant (currently the DEV team) completes edits → **releases a Draft** to PPA's CEO → CEO circulates the draft to Utility CEOs for comment (several weeks); flagged changes mean a utility amends inputs, and the benchmarking team refreshes the report + commentaries → the **Final version** is presented at the annual PPA meeting (2–4 months after the draft was released). *(Not yet a first-class modelled entity — see the report-versioning spec.)*
- **Input Cut-off** — a settable date per report version; at **1 second before midnight** on that date inputs close and **automatically trigger the snapshot**, then notify BMO/DEV that report generation can commence (a managed user journey). There are two cut-offs per cycle: the **Draft** cut-off and (after the comment window) the **Final** cut-off.
- **Report Version / Snapshot** — a frozen copy of source data + computed KPIs captured automatically at a version's Input Cut-off, *before* the report is generated, so every KPI in that version is verifiable against source data as it stood then. The **Draft** and **Final** reports are built from their snapshots and are immutable.
- **Updated (Final) Report** — a parallel, always-available version of a released report (e.g. "Updated FINAL Benchmarking Report 2024") that draws from **live data, not the snapshot**, tracking every input change since the Final was released — the transparent, current view alongside the frozen official record.
- **Fiscal Year (FY)** — standard temporal dimension (FY2022, FY2023, etc.).
- **Country Context** — country-level non-KPI data (GDP, population, renewable targets).
- **Utility Context Data** — utility-level non-KPI operational metadata.
- **Governance Data** — compliance, policy, regulatory data per utility.
- **Managed List** — configurable controlled vocabulary for categories, units, data types, energy sources, etc.
- **Power BI** — Microsoft Power BI is the primary data source for the AI (19 schema tables, 55+ DAX templates).
- **DAX** — Data Analysis Expressions language for Power BI queries.
- **Legacy Prism-Training Platform** — predecessor system; API parity maintained via /api/fact*, /api/dim* routes and DL definition mappings.
- **Data Freshness** — how recently the Power BI dataset was refreshed.
- **Vulnerability Score** — multi-dimensional risk score (0-100) combining diesel dependence, SAIDI, tariff recovery, electrification, island geography.
- **Peer Group** — comparison group by country, size, region, island count, customer count.
- **Proactive Alert** — threshold-based alerts: SAIDI > 500, losses > 15%, recovery < 80%, diesel > 70%, electrification < 80%, LTIFR > 5.
- **Executive Briefing** — 60-second AI summary: 5 key numbers, trends, red flags, recommendations.

## Donors & External

- **Donor / DFI** — external funding organisations (PPA, ADB, World Bank, GCF, NZ MFAT). Auto-fill templates and donor-specific reports available.
- **NDC** — Nationally Determined Contributions under the Paris Agreement.
- **World Bank Context** — live World Bank data: income classification, lending category, development indicators, active projects.
