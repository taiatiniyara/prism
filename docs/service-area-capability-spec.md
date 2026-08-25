# Service-area capability declaration — SUPERSEDED

**Status: SUPERSEDED 2026-08-26** by
[measure-relevance-spec.md](measure-relevance-spec.md) (Eugene + #8 aligned, B-clean).

This spec proposed a `service_area_capabilities` **span table** to declare transmission
capability (and, briefly, a rated transmission asset). Eugene **descoped the electrical rating**,
which removed the carried-state that made transmission span-shaped — so transmission is a **yes/no
editorial declaration**, and it was standardised onto the unified **`measure_relevance`** surface
alongside tariff (declared rows) and generation (stint-derived rows) instead of its own span table.

**What carried over** (the storage shape changed; the case law did not):
- **Bootstrap-not-inference** — relevance is *declared/derived*, never inferred from the presence
  of a shell. → measure-relevance-spec §1.
- **Append-vs-amend + the three consequence rules** (amend reflows shells+denominators; snapshots
  pin / live absorbs; amend carries provenance, append needs none) — now shared temporal-semantics
  for both stint edits and declared-row edits. → measure-relevance-spec §6, unit-lifecycle-spec.
- **The classification criterion** (rich timeline state → stints/spans; yes/no or per-cell
  editorial declarations → `measure_relevance`) — the rule that placed transmission on the
  relevance side once the rating was descoped. → measure-relevance-spec §7.

See [measure-relevance-spec.md](measure-relevance-spec.md) for the ratified design.
