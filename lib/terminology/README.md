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
- `useTerm.ts` — thin client hook over `resolveTerm`; reads the active sector from
  `sector-context` so client call sites need no changes in Phase 5b.
- `active-sector.ts` — **server** seam `getActiveSector()`: the single source of
  the request's active sector. **Phase 5b (live):** effective org (own org, or the
  DEV utility-context org) → `organisation_sector` memberships, with the
  `prism_active_sector` cookie honoured only within them; any failure →
  electricity. `react.cache()`-deduped per request.
- `active-sector.core.ts` — the **pure** precedence (`pickActiveSector`) + cookie
  name/parser, no Next/DB imports (unit-tested, shareable with client code).
- `sector-context.tsx` — **client** `SectorProvider` + `useActiveSector()`;
  **mounted once** in `app/layout.tsx` (`SessionShell`) from `getActiveSector()`,
  so every `useTerm()` follows the request's sector. Defaults to electricity when
  unmounted (tests / trees outside the shell).

## Phase 5b status (owned by #2 + #11 + #13)

The label layer is deliberately behind one indirection so the swap to real data
is **zero component churn**:

1. **#2 — DONE 2026-09-10:** additive DDL `sectors`, `sector_terminology(sector_id,
   concept_key, label, label_plural)` (seeded with the 3 ratified `service_area`
   rows) and `organisation_sector` (M:N, empty until #10/#13 populate membership).
   `service_areas.sector_id` + retiring `provides_*` is **deferred to #13/#8**
   (multi-provides areas exist — not a clean scalar backfill).
2. **#13 — open:** repoint **only `lookupTerm` in `terminology.config.ts`** at the
   `sector_terminology` table (preload into a map at request scope, or make the
   resolver async) — load-once-per-session + cache, invalidate on BMO edit;
   never per-render.
3. **#11 — DONE (this change):** `getActiveSector()` reads the effective org's
   `organisation_sector` memberships + the `prism_active_sector` cookie
   (precedence in `active-sector.core.ts`), and `<SectorProvider>` is mounted in
   the root layout. **Behaviour-neutral today** — the M:N table is empty, so every
   request resolves to electricity exactly as before. The sector *switch* UI that
   sets the cookie is Phase 5c (only meaningful once an org has >1 sector).

The `resolver.ts` contract, the `useTerm` API, and every call site stay as-is.
