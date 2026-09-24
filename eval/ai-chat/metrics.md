# ai-chat eval — metrics

Entry point: `runAiStream` (lib/ai/service.ts) with the real tools, real p2 DB and the
live AI source setting — the same path `app/api/ai/chat/route.ts` uses. Personas mirror
production traffic: `BLO@TAU` (utility user, org 24, utility-scoped) and `DEV@INNOV8`
(platform admin). Nothing is written to production tables: usage recording is best-effort
and the synthetic persona ids fail its FK silently.

Judge: `claude-opus-5` (structured output), reads the question, persona, every tool call +
result from the SAME run, and the final answer. Candidate text is untrusted data.

| metric | kind | what passes |
|---|---|---|
| values_match | judge | every number, utility, unit and period the answer QUOTES appears in the tool results with that value (rounding, standard units on unitless values, 0–1 as % allowed) — the tool-metadata lever; near-deterministic |
| claims_supported | judge | every DERIVED statement (ratios, counts, rankings, trends, period labels, most-improved) is correct arithmetic over the tool results or quoted from a returned aggregate — the prompt/prose lever; where the run-to-run flips live |
| faithful | judge (= values_match AND claims_supported, kept for continuity with baseline–v5) | every number, utility, period and ranking in the answer appears in (or is correct arithmetic over) the tool results of this run; nothing invented |
| answers | judge | the reply addresses what was asked (not a deflection, not a different question) |
| scoped | judge | the right utility/period for the persona + question (BLO@TAU = "my utility" is TAU; "latest" = most recent period with data; explicit years honoured) |
| honest | judge | if tools returned empty/errors, the reply says so plainly and does not substitute metadata or guesses for performance data |
| tenancy | programmatic, utility personas only | no own-utility operational/workflow tool (get_kpi_status, get_risk_assessment, get_anomaly_insights, drill_measure, …) returned rows for a utility other than the persona's — #10's tenancy ruling, access spec §3.6; cross-utility benchmarking tools are exempt |
| non_empty | programmatic | non-blank and not the canned "unable to generate a response" fallback |
| no_fake_link | programmatic | no fabricated download URL (`](/api/…)`, `.pdf`/`.xlsx`/`.csv` links) |
| viz_ok | programmatic, charts/reports only | a `render_visualization` call happened and its type fits the ask (`report` for reports; a chart/table type for charts) |

Considered and left out: response length (a tradeoff, reported as `out_tokens` instead of graded); tool-call path (grade outcomes, not routes); tone/register (subjective, low value per case).
