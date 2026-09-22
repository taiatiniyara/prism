Activation bundle (#4 PR #567) + get_kpi_status own-utility scoping (#566), prompt version 2026-09-22-report-activation.

- maxOutputTokens 6000 -> 12000 (c218/c223 truncation)
- base prompt: call get_benchmark_report_data ONCE for fleet reports + reference tables via table_ref
- base prompt Core Rule 10: state every value with the unit and period the tool returned; never convert/rename/infer units or assign a fiscal year to unlabelled rows
- per-request suffix: "this user belongs to utility_id N" for utility roles
- route maxDuration 120 -> 240
- get_kpi_status defaults to the caller's own utility for context-scoped users (#10 ruling, spec 3.6)
