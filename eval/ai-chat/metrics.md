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
| faithful | judge | every number, utility, period and ranking in the answer appears in (or is correct arithmetic over) the tool results of this run; nothing invented |
| answers | judge | the reply addresses what was asked (not a deflection, not a different question) |
| scoped | judge | the right utility/period for the persona + question (BLO@TAU = "my utility" is TAU; "latest" = most recent period with data; explicit years honoured) |
| honest | judge | if tools returned empty/errors, the reply says so plainly and does not substitute metadata or guesses for performance data |
| non_empty | programmatic | non-blank and not the canned "unable to generate a response" fallback |
| no_fake_link | programmatic | no fabricated download URL (`](/api/…)`, `.pdf`/`.xlsx`/`.csv` links) |
| viz_ok | programmatic, charts/reports only | a `render_visualization` call happened and its type fits the ask (`report` for reports; a chart/table type for charts) |

Considered and left out: response length (a tradeoff, reported as `out_tokens` instead of graded); tool-call path (grade outcomes, not routes); tone/register (subjective, low value per case).
