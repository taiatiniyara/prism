"use client";

import { resolveTerm, type ResolveOptions } from "./resolver";
import type { ConceptKey } from "./concepts";

// Client hook for sector-aware terminology (resolutions doc Q3, #11 condition 2).
// UI components read display terms through this (or the server-side `resolveTerm`)
// and NEVER hardcode strings — so the Phase-5b table swap is zero component churn.
//
// PHASE 5A SEAM: electricity is the only live sector, so the active sector
// defaults inside `resolveTerm` (DEFAULT_SECTOR). When multiple sectors go live
// (Phase 5b) thread the real active sector in from the single filter-context
// source (follow the cookie-scope pattern of lib/utility-context.ts) — either
// here, or by passing `{ sector }`. No call site changes.
export const useTerm = (
  concept: ConceptKey,
  options: ResolveOptions = {},
): string => resolveTerm(concept, options);
