# CONTEXT.md — PRISM Domain Glossary

A glossary of domain terms, not a spec. No stack choices or implementation details.

---

## Core Entities

- **PRISM** — benchmarking platform for Pacific electricity utilities, owned by PPA.
- **PPA (Pacific Power Association)** — regional industry association governing the platform, setting PPA Targets, providing the BSC Master Template.
- **Utility / Organisation** — an electricity provider that is a PPA member. Has service areas, power stations, energy resources, report periods, users, and a BSC. (DB: `organisations`, `is_utility = true`.)
- **Country** — a Pacific Island nation (ISO codes, currency, UN sub-region, ADB membership).
- **Sub-Region** — UN continental regional grouping (Melanesia, Micronesia, Polynesia).
- **Service Area** — a geographic territory within a utility. The primary scoping dimension for data entry.
- **Power Station** — a physical generating facility in a service area.
- **Energy Resource** — a generating unit or aggregation within a power station (provider, type, source, capacity MW).

## Data Entry

- **Input Definition** — the atomic data-entry field: name, variable name, formula, category, unit, validation rules, aggregation level. Feeds KPIs via Formula Inputs.
- **Data Entry** — a single submitted value for an Input Definition, scoped to a report period, service area, energy resource, provider, source, customer type, payment mode.
- **Data Entry Status** — workflow stage: Requested → Pending → Entered → Reviewed → Approved → Endorsed (or Not Available).
- **Input Relevance** — whether an Input Definition applies to a given dimension (utility type, service type, etc.).
- **Generation Relevance** — per-energy-resource scoping of which inputs apply.
- **Formula Input** — a variable mapping an Input Definition to a name used in a KPI formula (scoped by energy provider/type/source).
- **DL Definition** — legacy training platform dimension; mapped via `input_dl_def_mappings` for backward compatibility.

## KPIs & Benchmarks

- **KPI Definition** — metadata blueprint: name, formula, formula inputs, category, unit, type (benchmarking/custom), targets, limits, aggregation level.
- **KPI (instance)** — calculated value per report period, service area, energy resource, etc.
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
- **Roles** — DEV (full), BMO (benchmarking manager), BLO (utility liaison), CEO, EXE, DAOF/DAOH/DAOO (data entry officers), MGR (manager), EXT (external).
- **Proxy** — Next.js middleware protecting /dashboard/*, /data-entry/*, /settings/*, /profile/*, /docs/*, /prism-ai/* via session check + role-based route gating.
- **Utility Context Scope** — DEV feature to scope the view to a specific utility.
- **External Registration** — registration for non-utility users (consultants, donors, researchers).

## Data & Operations

- **Report Period** — time-bound reporting window (Financial Year, Monthly) per utility; scopes all data entries and KPIs.
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
