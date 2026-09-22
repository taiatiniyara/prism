v2 = v1 (activation #567, scoping #566) + data fixes:

- #574 compare_kpis_across_utilities: per-row unit + report_period, one row per utility (DISTINCT ON latest period); get_benchmark_report_data on gold.fact_kpi_rollup with plausibility gate (data_quality key), display strings, direction-aware most_improved
- #577 drill_measure: explicit-utility path denied for non-global roles
- #579 get_trend_analysis: completion progress own-utility only
- eval harness: shared buildRequestContext (v1 had run WITHOUT the own-utility line); +2 tenancy probes (c900, c901)
