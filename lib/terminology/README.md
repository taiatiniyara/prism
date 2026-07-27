# `lib/terminology` — sector-aware label layer (ADR 0003, Phase 5a)

Resolves a **concept** (e.g. `service_area`) to the **display label** for the
**active sector** (electricity → "Grid", water → "Supply Zone", sanitation →
"Catchment"). Storage columns/keys are never renamed — this is presentation only
("IDs in the tables, names in the views").

Ratified design + rationale: `docs/multi-sector-terminology-resolutions.md` (Q3);
parent decision `docs/adr/0003-multi-sector-terminology.md`.

## Use it

```ts
// Server components / server code (sync, pure):
import { resolveTerm } from "@/lib/terminology/resolver";
resolveTerm("service_area");                 // "Grid"
resolveTerm("service_area", { plural: true }); // "Grids"

// Client components:
import { useTerm } from "@/lib/terminology/useTerm";
const label = useTerm("service_area");       // "Grid"
```

Never hardcode a sector term in a component — always go through the resolver/hook.
`concept` is a registered constant (`concepts.ts`); a typo is a compile error.

## Files

- `sectors.ts` — the `Sector` union + `DEFAULT_SECTOR` (electricity).
- `concepts.ts` — registered `ConceptKey`s + code-level `NEUTRAL_DEFAULTS`
  (the guaranteed fallback, so nothing ever renders blank/snake_case).
- `terminology.config.ts` — the **interim app-config map** + the `lookupTerm` seam.
- `resolver.ts` — the one resolver (map → neutral default → raw key).
- `useTerm.ts` — thin client hook over `resolveTerm`.

## Phase 5b handoff (owned by #2 + #11)

The label layer is deliberately behind one indirection so the swap to real data
is **zero component churn**:

1. **#2** lands the additive DDL: `sectors`, `sector_terminology(sector_id,
   concept_key, label, label_plural)`, `service_areas.sector_id` (backfill
   Electricity, retire `provides_electricity/water/sanitation`), and
   `organisation_sector`.
2. **#11** repoints **only `lookupTerm` in `terminology.config.ts`** at the
   `sector_terminology` table (preload into a map at request scope, or make the
   resolver async), and wires the real **active sector** into `useTerm` /
   `resolveTerm` calls from the single filter-context source (cookie-scope
   pattern, cf. `lib/utility-context.ts`) — load-once-per-session + cache,
   invalidate on BMO edit; never per-render.

The `resolver.ts` contract, the `useTerm` API, and every call site stay as-is.
