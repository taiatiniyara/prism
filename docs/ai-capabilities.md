# PRISM AI — Capability Map & Question Coverage

Generated 2026-06-10. Maps every AI tool to the user questions it answers.

---

## Tool → Question Coverage

| # | Tool | Answers questions like... |
|---|------|--------------------------|
| 1 | `get_kpi_status` | What's our completion rate? How many KPIs are pending/entered/reviewed? What's the latest report period? |
| 2 | `get_benchmarking_data` | How do we rank against peers? What's the peer average? Who are the top/bottom performers? |
| 3 | `get_completeness_breakdown` | Which categories have the most pending KPIs? What's completeness by service area / energy source? |
| 4 | `get_scorecard_summary` | What's our overall score? Which perspectives are strongest/weakest? What KPIs are most off-track? Why are KPIs excluded? |
| 5 | `get_trend_analysis` | Is our completion improving or declining? Which utilities improved the most? |
| 6 | `get_anomaly_insights` | Which utilities had completion drops? Where did pending rates spike? What's the watchlist? |
| 7 | `get_governance_audit` | Who owns pending items? What's the pending ownership distribution? When were periods last updated? |
| 8 | `get_configuration_options` | What report periods exist? What KPI categories/subcategories are available? What service areas are configured? |
| 9 | `get_performance_snapshot` | What are our review status counts? Which KPIs are weakest? What's the scorecard score? |
| 10 | `get_kpi_diagnostics` | Which KPIs are stale/error/missing-input? How many unresolved comments? What's the root cause? |
| 11 | `render_visualization` | (internal) Renders table, bar/line chart, leaderboard, sankey, heatmap, radar, scatter |
| 12 | `suggest_follow_ups` | (internal) What should the user ask next? |
| 13 | `dashboard_link` | (internal) Where in PRISM can the user take action? Generate deep links with pre-applied filters. |
| 14 | `calculate_kpi` | What's our SAIDI value? Compute a specific KPI from formula + inputs. What-if: what happens if X changes by Y%? |
| 15 | `get_review_queue` | What KPIs need my attention? Who needs to approve what? What's stuck? |
| 16 | `get_input_status` | Which specific inputs are missing for KPI X? What data do I need to enter? |
| 17 | `explain_kpi` | What does SAIDI mean? How is it calculated? What category does it belong to? What are the limits? |
| 18 | `get_custom_kpi_status` | What custom KPI requests are pending? Where do I manage custom KPIs? |
| 19 | `get_service_area_breakdown` | How does performance vary across service areas? Which areas have the most pending? |
| 20 | `get_peer_group_analysis` | How do we rank against similar-sized utilities? What's the group average? |
| 21 | `get_risk_assessment` | Which utilities are at highest risk? Where should funding go? Who has governance gaps? |
| 22 | `get_data_quality_report` | Are there any suspicious values? Negative values where they shouldn't be? Values outside expected ranges? |
| 23 | `compare_periods` | How does 2022 compare to 2023? What changed between the two periods? Side-by-side delta view. |
| 24 | `get_what_changed` | Which KPIs moved the most between periods? Biggest improvers and decliners? |
| 25 | `get_compliance_status` | Which KPIs are out of regulatory limits? Critical vs warning issues? |
| 26 | `get_kpi_targets` | What targets should we set? What's the peer median / top quartile / bottom quartile? |
| 27 | `get_kpi_correlation` | Do utilities with high system losses also have high SAIDI? Pearson correlation coefficients. |
| 28 | `compare_kpis_across_utilities` | Compare actual KPI values across multiple utilities with per-utility rankings. |
| 29 | `generate_export` | Generate downloadable CSV or Excel report from analysis results. |
| 30 | `get_country_hierarchy` | What's the Pacific country and sub-region hierarchy? ISO codes, UN regional classifications, ADB membership. |
| 31 | `get_industry_benchmarks` | What are the industry-standard benchmarks for Pacific electricity utility KPIs? World Bank, ADB, IRENA, PPA targets. |
| 32 | `get_executive_digest` | Generate an executive briefing digest with key metrics, trends, top actions, risks, and benchmark context. |
| 33 | `get_review_queue_entries` | View the AI review queue — flagged conversations needing human review. Admin only (DEV/BMO). |
| 34 | `get_guided_entry` | Step-by-step data entry guidance for a specific KPI. Which inputs to fill, where to find them, expected values. |

---

## Question Taxonomy by Persona + Domain

### UTILITY MANAGER

#### Performance & Scorecard
| Question | Tool(s) |
|---|---|
| What's our overall balanced scorecard score? | 4 |
| Which perspectives are strongest/weakest? | 4, 9 |
| What are our top 5 weakest KPIs? | 4, 9 |
| How do our actual KPI values compare to targets? | 4, 14 |
| What's our SAIDI / SAIFI / System Loss / Tariff Recovery / Capacity Factor / Electrification Rate? | 14 |
| What KPIs are off-track vs on-track vs at-risk? | 4 |
| Why are certain KPIs excluded from the scorecard? | 4 |
| How many KPIs were excluded and for what reasons? | 4 |

#### Data Entry & Completion
| Question | Tool(s) |
|---|---|
| What's our completion rate for this period? | 1 |
| How many KPIs are pending vs entered vs reviewed? | 1, 9 |
| Which categories have the most incomplete data? | 3 |
| What specific inputs are missing for KPI X? | 16 |
| Why is KPI X showing as stale/error/missing-input? | 10 |
| What data do I need to enter to complete my scorecard? | 10, 16 |
| Which service areas have the most pending KPIs? | 3, 19 |

#### Review & Approval
| Question | Tool(s) |
|---|---|
| What's in my review queue right now? | 15 |
| Who needs to approve which KPIs? | 7, 15 |
| How many reviewed KPIs are stuck pending approval? | 15 |
| How many unresolved comments do I have? | 10, 15 |
| What's blocking my scorecard from being generated? | 4, 10 |

#### Trends & Change
| Question | Tool(s) |
|---|---|
| Is our completion rate improving or declining? | 5 |
| How has our performance changed year-on-year? | 5, 23, 24 |
| Which KPIs changed the most since last period? | 24 |
| What's our 5-year trend for system losses? | 5, 14 |
| How does 2022 compare to 2023 side-by-side? | 23 |

#### What-If & Scenario
| Question | Tool(s) |
|---|---|
| If we improve SAIDI by 10%, how does our overall score change? | 14 |
| What if system losses drop to 8%? | 14 |
| If we reduce pending KPIs from 200 to 50, what's our new completion rate? | 14 |
| What would it take to go from off-track to on-track? | 14 |

#### Targets & Goal Setting
| Question | Tool(s) |
|---|---|
| What KPI targets should we set for next year? | 26 |
| What's the peer median for system losses? | 26 |
| How does our performance compare to top-quartile utilities? | 26 |
| Are targets realistic based on peer benchmarks? | 26, 31 |

#### Data Entry Guidance
| Question | Tool(s) |
|---|---|
| How do I enter data for SAIDI? | 34 |
| What inputs do I need to fill in? | 34, 16 |
| Where in PRISM do I find the data entry form? | 34 |

---

### DONOR

#### Benchmarking & Ranking
| Question | Tool(s) |
|---|---|
| How do utilities compare across the region? | 2 |
| Which utilities are below the regional median? | 2, 20 |
| Who's performing best / worst overall? | 2 |
| How does utility X rank among peers of similar size? | 20 |
| What's the peer average completion rate? | 2, 20 |
| Which country has the best / worst performance? | 2, 20 |

#### Risk & Prioritisation
| Question | Tool(s) |
|---|---|
| Which utilities are at highest risk? | 21 |
| Where should donor funding be prioritised? | 21 |
| Which utilities have governance gaps? | 7, 21 |
| Where is completion declining fastest? | 5, 6 |
| Are there any utilities with zero approved KPIs? | 1, 21 |
| Which utilities have the most pending data? | 1, 2 |

#### Impact & Outcomes
| Question | Tool(s) |
|---|---|
| What's the regional electrification rate trend? | 5, 14 |
| Which utilities have the biggest performance gap to close? | 2, 20 |
| Are KPIs showing anomalous values that need investigation? | 6, 22 |
| What's the trend for generation capacity across the region? | 5, 14 |
| How do KPI correlations reveal systemic issues? | 27 |
| What's the Pacific regional benchmark context? | 31 |

#### Export & Reporting
| Question | Tool(s) |
|---|---|
| Can I download this analysis as a CSV? | 29 |
| Generate a summary report for my stakeholders. | 29, 32 |
| Give me an executive briefing on regional performance. | 32 |

---

### REGULATOR

#### Compliance & Standards
| Question | Tool(s) |
|---|---|
| Which utilities met their regulatory targets? | 14, 25 |
| Which KPIs are out of regulatory compliance? | 25 |
| Are there any implausible or out-of-range KPI values? | 22 |
| Which utilities have negative values where they shouldn't? | 22 |
| Has any utility's data quality declined? | 6, 22 |
| How complete is the data across the sector? | 1, 2 |
| What are the industry benchmarks for Pacific utilities? | 31 |

#### Governance & Audit
| Question | Tool(s) |
|---|---|
| Who is responsible for approvals at each utility? | 7 |
| How long have KPIs been stuck in review? | 7, 15 |
| Which utilities have the most unresolved comments? | 10, 15 |
| What's the approval chain for KPI submissions? | 7 |
| When was each utility's data last updated? | 7 |

#### Trend & Anomaly Detection
| Question | Tool(s) |
|---|---|
| Which utilities had anomalous completion drops? | 6 |
| Where did pending rates spike unexpectedly? | 6 |
| Are any KPIs showing anomalous jumps in value? | 6, 24 |
| Is the sector trending toward better or worse data quality? | 5 |

---

### PLATFORM ADMIN (BMO/DEV)

#### Configuration
| Question | Tool(s) |
|---|---|
| What report periods exist in the system? | 8 |
| How many active KPI definitions are there? | 8 |
| What categories/subcategories are configured? | 8 |
| Which service areas are set up for each utility? | 8 |
| What energy sources / providers / types are configured? | 8 |

#### KPI Management
| Question | Tool(s) |
|---|---|
| What's the formula for KPI X? | 17 |
| What limits are configured for KPI X? | 17 |
| Which KPIs are benchmarking type vs custom? | 17 |
| What custom KPI requests are in the pipeline? | 18 |
| How do I explain KPI X to a utility manager? | 17 |
| Are there KPIs that correlate strongly? | 27 |

#### System Health
| Question | Tool(s) |
|---|---|
| What's the overall platform completion rate? | 1 |
| Which utilities haven't submitted any data? | 1, 2 |
| How many total KPIs are in scope across all utilities? | 1 |
| What's the data quality status across the platform? | 22 |
| Are there flagged AI conversations needing review? | 33 |

---

### EXTERNAL / PUBLIC

| Question | Tool(s) |
|---|---|
| What is PRISM? | (system prompt) |
| What utilities participate? | 2 |
| What metrics are tracked? | 8, 17 |
| How is SAIDI / SAIFI / System Loss calculated? | 17 |
| What's a balanced scorecard? | (system prompt) |
| How do I get access to PRISM? | (system prompt) |
| Which countries are in the Pacific region? | 30 |
| What are the industry benchmarks for utility performance? | 31 |

---

## By KPI Domain

### Financial
- Revenue per customer, average tariff, cost recovery ratio
- Debt service coverage, operating ratio, collection efficiency
- **Tools**: 4, 14, 17

### Customer / Reliability
- SAIDI (System Average Interruption Duration Index)
- SAIFI (System Average Interruption Frequency Index)
- New customer connections, connection density, complaint resolution
- **Tools**: 4, 14, 17

### Operations
- System loss percentage (technical vs non-technical)
- Generation capacity factor, plant availability
- Fuel efficiency, heat rate, maintenance backlog
- **Tools**: 4, 14, 17

### Development
- Electrification rate (rural vs urban)
- New lines installed, transformers added
- Renewable energy share, capital expenditure vs budget
- **Tools**: 4, 14, 17

### Cross-Cutting
- KPI correlations (do high-loss utilities also have high SAIDI?)
- Multi-utility value comparisons with rankings
- Exportable reports (CSV, Excel)
- Executive briefing digests
- Country/sub-region hierarchy reference
- Industry benchmarks (World Bank, ADB, IRENA, PPA)
- Guided data entry workflows
- **Tools**: 27, 28, 29, 30, 31, 32, 34

---

## Coverage Status

| Category | Coverage |
|---|---|
| Status / descriptive | 100% |
| Diagnostic / root cause | 100% |
| Comparative / benchmarking | 100% |
| Trend / time-series | 100% |
| Prioritisation / ranking | 100% |
| Governance / audit | 100% |
| Definition / explainer | 100% |
| What-if / scenario | 100% — calculate_kpi supports hypothetical values + sensitivity analysis |
| Regulatory compliance | 100% |
| Action / next steps | 100% — review queue + input status + dashboard links + guided entry |
| Data quality | 100% |
| Risk assessment | 100% |
| Correlation / analysis | 100% |
| Export / reporting | 100% |
| Reference / hierarchy | 100% |

**Total: ~200 question patterns covered by 34 tools.**
