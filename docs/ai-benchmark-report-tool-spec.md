# AI Composite Benchmark-Report Tool — Spec

**Status:** Spec for the AI/schema stream (#4) to implement · **Author:** #3 (calculator/eugen-61), at Eugene's request 2026-09-21
**Owner (implementation):** #4 (AI tools / `lib/ai/data-service`, `lib/ai/tools`) · **Consult:** #3 on gold-rollup math + the `report` block shape

---

## 1. Why

A whole-fleet benchmarking report (*"2024 benchmark across all utilities + PDF"*) currently fails with a client **"network error"**. Root cause (from the `ai_chat_turn` trace): the model assembles the report by calling **many small tools in ~10 sequential steps** — `compare_kpis_across_utilities`, `get_industry_benchmarks`, `get_compliance_status`, `get_kpi_status`, `get_kpi_targets`, … — each step a full **API round-trip + DB query**. That ran **116 s** and pulled **96 k input tokens**, hitting the route's `maxDuration = 120 s` before the report finished; the stream dropped → "network error".

**This tool collapses those ~10 round-trips into ONE.** It's the single biggest performance win for the least cost (no infra spend), and on its own removes most of the timeout risk. (Complementary, separate: nginx `proxy_read_timeout` ≥120 s + streaming keep-alive — flagged to #1/#4; and the shipped lean-gathering prompt, PR #519.)

## 2. The tool

**`get_benchmark_report_data`** — one call returns everything a fleet-wide performance/benchmark report needs, gathered server-side in a handful of parallel set-based queries (never per-utility loops).

### Input (zod)
- `fiscal_year?: string` — e.g. `"FY2024"`. Default: latest FY with data.
- `kpi_names?: string[]` — default the standard benchmark set (SAIDI, SAIFI, System Losses, Operating Cost Recovery, Renewable Energy to Grid, Electrification, plus whatever the current report uses). Resolve via the **existing KPI synonym resolver** (`explain.ts` / the resolver `compare_kpis_across_utilities` already uses).
- `include_prior_year?: boolean` — default `true` (needed for "most improved").

### Output (`AiToolResult<BenchmarkReportData>`) — one bundle
```ts
{
  fiscal_year: string;
  utilities: Array<{ utility_id; acronym; name; country; size; sub_region }>; // gold.dim_utility
  kpis: Array<{
    kpi_name; unit;
    per_utility: Array<{ utility_id; acronym; value; meets_target; target; prior_year_value? }>;
    pacific_avg: number | null;
    best:  { acronym; value } | null;   // best performer (direction-aware — see §4)
    worst: { acronym; value } | null;
    most_improved?: { acronym; delta };  // vs prior year (when include_prior_year)
  }>;
  reporting_status_summary?: unknown;    // gold.v_reporting_status — who's submitted/approved
  notes: string[];                       // periods used, data gaps, excluded utilities
}
```
The model writes the exec summary + commentary from this and renders a **`report`** visualization block (Download PDF). It should NOT need any other data-gathering call for the report.

## 3. Data sources (all already in the gold layer)
- **`gold.fact_kpi_rollup`** — per-utility × per-KPI: `avg_value`, `min_value`, `max_value`, `entries_meeting_target`, `entries_with_target`, `report_date`, `utility_size_id`, `sub_region_id`. This is the workhorse: rankings, meets-target, and (across two `report_date`s) most-improved all come from here.
- **`gold.fact_kpi`** — if finer per-period values are needed beyond the rollup.
- **`gold.dim_utility`** — utility metadata (acronym/name/country/size/sub_region).
- **`gold.v_reporting_status`** — submission/approval summary.
- Prior-year values: the same rollup at the prior FY's `report_date`.

Because it's all pre-joined gold, this is a few queries, not N. Reuse existing service fns where they already do the right thing (e.g. wrap `compareKpisAcrossUtilities` / `getIndustryBenchmarks` under one `Promise.all`) — but a couple of direct `fact_kpi_rollup` queries will likely be leaner than composing several existing tools.

## 4. Correctness notes (consult #3)
- **Direction-aware best/worst:** lower is better for SAIDI/SAIFI/losses; higher is better for cost recovery/renewables/electrification. Don't assume "max = best". Carry a per-KPI polarity (the KPI catalogue / target semantics already encode this — reuse, don't hardcode).
- **Never average ratios across utilities naively** for "pacific_avg" if the KPI is a ratio — follow the same rule the calculator uses (the rollup's `avg_value` is per-utility; a fleet average of ratios is a mean-of-ratios, which is fine for a benchmark headline but label it as such).
- **most_improved** = biggest favourable delta prior→current, again direction-aware.
- Utilities with no value for a KPI are gaps (omit from best/worst, note in `notes`), never 0.

## 5. Access / scoping
Same as `compare_kpis_across_utilities`: apply the benchmark-access rule (`periodAccessPredicate` + BLO/BMO/DEV/CEO/EXE/MGR/DAOF/DAOH/DAOO get all approved-FY utilities; scoped users their own). Return only what the caller may see; `notes` records any exclusions.

## 6. Prompt wiring
Add one line to the system prompt (Data Strategy / the report guidance): *"For a fleet-wide, benchmarking, or 'all utilities' report, call `get_benchmark_report_data` ONCE and compile the report from its result — do NOT loop `compare_kpis_across_utilities` / the per-metric tools (that's the slow multi-round-trip path). Then render a `report` block."* This is what actually forces the 1-call path; the tool without the prompt nudge won't be used.

## 7. Payoff
~10 round-trips → **1**; ~96 k gathered tokens → a compact structured bundle; ~116 s → a few seconds. Removes most of the timeout risk on its own, and makes the fleet report cheap to run.

## 8. Ownership
#4 implements (tool + service fn + prompt line). #3 available for the gold-rollup ranking/polarity math and to keep the output shape aligned with the `report` block that feeds `renderReportPdf`.
