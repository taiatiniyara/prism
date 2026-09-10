import type { Sector } from "./sectors";
import type { ConceptKey } from "./concepts";
import { TERMINOLOGY } from "./terminology.generated";

export interface TermLabel {
  label: string;
  // Optional; resolver falls back to `label` when absent (resolutions doc Q3,
  // #11 condition 4 — never string-concatenate an "s").
  labelPlural?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminology lookup — Phase 5b.
//
// The label map is now sourced from the BMO-maintainable `sector_terminology`
// table, generated into `terminology.generated.ts` by
// scripts/build-terminology-config.ts (the interim Phase-5a app-config const is
// retired). `lookupTerm` stays a pure, synchronous read of that bundled snapshot,
// so `resolver.ts`, the `useTerm()` hook, and every call site are unchanged — and
// the client (which cannot read the DB) is safe. Regenerate + redeploy after a
// label edit. A (sector, concept) with no row falls through to NEUTRAL_DEFAULTS.
// ─────────────────────────────────────────────────────────────────────────────
export const lookupTerm = (
  sector: Sector,
  concept: ConceptKey,
): TermLabel | undefined => TERMINOLOGY[sector]?.[concept];
