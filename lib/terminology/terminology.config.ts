import type { Sector } from "./sectors";
import type { ConceptKey } from "./concepts";

export interface TermLabel {
  label: string;
  // Optional; resolver falls back to `label` when absent (resolutions doc Q3,
  // #11 condition 4 — never string-concatenate an "s").
  labelPlural?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERIM app-config terminology map (ADR 0003 / resolutions doc Q3, Phase 5a).
//
// This constant is the ONLY thing that changes when Phase 5b lands the
// BMO-maintained `sector_terminology(sector_id, concept_key, label, label_plural)`
// table: repoint `lookupTerm` at the table (async or preloaded map). The resolver
// (`resolver.ts`), the `useTerm()` hook, and every call site stay untouched —
// that indirection is the whole point of shipping the label layer now.
//
// A (sector, concept) with no entry here falls through to NEUTRAL_DEFAULTS.
// Labels are Eugene-ratified (2026-07-27); electricity is the only sector
// surfaced in Phase 5a, but water/sanitation labels are seeded so Phase 5c
// inherits them.
// ─────────────────────────────────────────────────────────────────────────────
const TERMINOLOGY: Partial<
  Record<Sector, Partial<Record<ConceptKey, TermLabel>>>
> = {
  electricity: {
    service_area: { label: "Grid", labelPlural: "Grids" },
  },
  water: {
    service_area: { label: "Supply Zone", labelPlural: "Supply Zones" },
  },
  sanitation: {
    service_area: { label: "Catchment", labelPlural: "Catchments" },
  },
};

// The single lookup seam. Phase 5b swaps the body for a `sector_terminology`
// read; nothing else moves.
export const lookupTerm = (
  sector: Sector,
  concept: ConceptKey,
): TermLabel | undefined => TERMINOLOGY[sector]?.[concept];
